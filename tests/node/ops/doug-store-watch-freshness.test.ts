import { describe, expect, it } from "vitest";
import {
  assessStaleness,
  formatAge,
  type RunSummary,
  readStartedAt,
  STALE_AFTER_HOURS,
  shouldNotify,
} from "../../../scripts/doug-store-watch-freshness";

const NOW = Date.parse("2026-10-13T12:00:00.000Z");
const hoursAgo = (h: number) => NOW - h * 3_600_000;
const run = (name: string, ageHours: number): RunSummary => ({
  name,
  startedAtMs: hoursAgo(ageHours),
});

describe("assessStaleness", () => {
  it("stays silent while runs are landing on the 4h cadence", () => {
    // Silence is the success signal for this whole job. A fresh run must
    // produce no line to print and no alert key to remember.
    const verdict = assessStaleness([run("a", 8), run("b", 4), run("c", 0.2)], NOW);
    expect(verdict.stale).toBe(false);
    expect(verdict.line).toBeNull();
    expect(verdict.alertKey).toBeNull();
    expect(verdict.newest?.name).toBe("c");
  });

  it("alerts once the newest run passes the 5h window", () => {
    // LAC-4335: the 04:00 ET slot on 2026-10-13 never started. Nothing noticed
    // because a run that never runs looks exactly like a clean one.
    const verdict = assessStaleness([run("old", 12), run("last-good", 8)], NOW);
    expect(verdict.stale).toBe(true);
    expect(verdict.newest?.name).toBe("last-good");
    expect(verdict.ageHours).toBe(8);
    expect(verdict.line).toBe(
      "Store watch is blind: no run in 8h. Last run 2026-10-13 00:00 ET, expected every 4h. Doug's stores are unwatched."
    );
  });

  it("holds its fire right up to the grace window and fires just past it", () => {
    // Cadence is 4h, so 5h is one full cycle plus an hour of slack. A run that
    // merely started late must not page anyone.
    expect(assessStaleness([run("x", STALE_AFTER_HOURS - 0.1)], NOW).stale).toBe(false);
    expect(assessStaleness([run("x", STALE_AFTER_HOURS + 0.1)], NOW).stale).toBe(true);
  });

  it("treats an evidence directory with no runs as blind, not as healthy", () => {
    // The empty state. An absent directory is the strongest possible version of
    // the bug this check exists for, so it cannot be the quiet path.
    const verdict = assessStaleness([], NOW);
    expect(verdict.stale).toBe(true);
    expect(verdict.newest).toBeNull();
    expect(verdict.ageHours).toBeNull();
    expect(verdict.line).toBe(
      "Store watch is blind: no run has ever been recorded. Doug's stores are unwatched."
    );
    expect(verdict.alertKey).toBe("stale-since:never");
  });

  it("judges on the newest run, not on how many old ones piled up", () => {
    const verdict = assessStaleness([run("a", 30), run("b", 20), run("c", 10)], NOW);
    expect(verdict.newest?.name).toBe("c");
    expect(verdict.ageHours).toBe(10);
  });

  it("does not call a clock-skewed future run stale", () => {
    expect(assessStaleness([run("tomorrow", -2)], NOW).stale).toBe(false);
  });

  it("accepts a wider window so a human can check against a different cadence", () => {
    expect(assessStaleness([run("x", 8)], NOW, 12).stale).toBe(false);
  });

  it("writes midnight ET as 00:00, not 24:00", () => {
    // A 4h cadence puts a run at midnight ET twice a day, and some ICU builds
    // render that hour as 24 under `hour12: false`. "2026-10-13 24:00 ET" in a
    // 3am phone alert is a line that makes the reader doubt the alert.
    const midnightEt = Date.parse("2026-10-13T04:00:00.000Z");
    const verdict = assessStaleness(
      [{ name: "midnight", startedAtMs: midnightEt }],
      midnightEt + 8 * 3_600_000
    );
    expect(verdict.line).toContain("Last run 2026-10-13 00:00 ET");
  });
});

describe("shouldNotify", () => {
  const blind = assessStaleness([run("last-good", 8)], NOW);

  it("sends nothing when the watch is healthy", () => {
    expect(shouldNotify(assessStaleness([run("x", 1)], NOW), null)).toBe(false);
  });

  it("sends the first time a gap is seen", () => {
    expect(shouldNotify(blind, null)).toBe(true);
  });

  it("stays quiet for the rest of the same gap", () => {
    // An alert is an interface, and an hourly check that re-DMs every hour for
    // a two-day gap is an interface nobody will read twice. The newest run does
    // not move while the gap persists, so the key does not either.
    expect(shouldNotify(blind, blind.alertKey)).toBe(false);
  });

  it("sends again when a new gap opens after the watch recovered", () => {
    // Recovered: a run landed, so the newest run moved. A later gap is a
    // different gap and deserves its own DM.
    const recoveredThenBlindAgain = assessStaleness([run("later-good", 6)], NOW);
    expect(recoveredThenBlindAgain.alertKey).not.toBe(blind.alertKey);
    expect(shouldNotify(recoveredThenBlindAgain, blind.alertKey)).toBe(true);
  });

  it("keys on the last good run, so the key does not drift as the gap widens", () => {
    // Same run, later clock. The hourly check must compute the same key every
    // hour of the gap or the dedupe above never fires.
    const lastGood = run("last-good", 8);
    const first = assessStaleness([lastGood], NOW);
    const anHourLater = assessStaleness([lastGood], NOW + 3_600_000);
    expect(anHourLater.ageHours).toBe(9);
    expect(anHourLater.alertKey).toBe(first.alertKey);
  });
});

describe("readStartedAt", () => {
  const FALLBACK = Date.parse("2026-01-01T00:00:00.000Z");

  it("uses the run's own startedAt, which survives a file being touched", () => {
    const raw = JSON.stringify({ startedAt: "2026-10-13T04:00:51.584Z", verdict: "clean" });
    expect(readStartedAt(raw, FALLBACK)).toBe(Date.parse("2026-10-13T04:00:51.584Z"));
  });

  it("falls back to the directory mtime when report.json has no usable timestamp", () => {
    expect(readStartedAt(JSON.stringify({ verdict: "clean" }), FALLBACK)).toBe(FALLBACK);
    expect(readStartedAt(JSON.stringify({ startedAt: "not a date" }), FALLBACK)).toBe(FALLBACK);
  });

  it("falls back rather than throwing on a truncated report", () => {
    // A run killed mid-write leaves half a file. That is a reason to trust the
    // mtime, not a reason to crash the only thing watching the watch.
    expect(readStartedAt('{"startedAt": "2026-', FALLBACK)).toBe(FALLBACK);
  });
});

describe("formatAge", () => {
  it("drops a pointless trailing zero", () => {
    expect(formatAge(8)).toBe("8h");
    expect(formatAge(72)).toBe("72h");
  });

  it("keeps one decimal when the fraction is what distinguishes the number", () => {
    expect(formatAge(5.25)).toBe("5.3h");
  });
});

describe("STALE_AFTER_HOURS", () => {
  it("is one 4h cadence plus an hour of grace", () => {
    expect(STALE_AFTER_HOURS).toBe(5);
  });
});
