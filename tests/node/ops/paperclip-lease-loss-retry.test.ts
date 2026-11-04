import { describe, expect, it } from "vitest";
import {
  decide,
  describe as describeRun,
  formatAge,
  GRACE_MINUTES,
  LEASE_LOST_ERROR,
  MAX_AGE_HOURS,
  pruneKeys,
  type ReapedRun,
  skipKey,
} from "../../../scripts/paperclip-lease-loss-retry";

const NOW = Date.parse("2026-10-16T10:00:00.000Z");
const minutesAgo = (m: number) => NOW - m * 60_000;

const reaped = (over: Partial<ReapedRun> = {}): ReapedRun => ({
  runId: "9742cd51-bebc-4aef-87d2-ae5f59c9e0aa",
  agentId: "e9f0a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b",
  agentName: "Founding Engineer",
  agentStatus: "idle",
  identifier: "LAC-4600",
  title: "a slot",
  issueStatus: "blocked",
  originKind: "routine_execution",
  diedAtMs: minutesAgo(30),
  requestedAtMs: minutesAgo(30),
  newerRunForIssue: false,
  alreadyRetried: false,
  agentBusy: false,
  ...over,
});

/**
 * The real LAC-4564, the reap this file exists for. The laptop slept at 1%
 * battery, the 08:00Z Doug store watch slot was killed mid-setup, and the issue
 * sat `blocked` for 9.5h with nobody told (LAC-4568). Its only run was reaped at
 * 09:29:17Z and no run ever started on that issue again, so the sweep running at
 * the time would have put the slot back on its feet inside 5 minutes.
 */
const lac4564 = reaped({
  identifier: "LAC-4564",
  title: "Doug store watch (every 4h, read-only)",
  requestedAtMs: Date.parse("2026-10-16T08:00:20.471Z"),
  diedAtMs: Date.parse("2026-10-16T09:29:17.038Z"),
});

/**
 * The real LAC-4210, the reap that made `stale` measure the request clock. Its
 * run was created at 04:52:16Z and not reaped until 06:52:32Z, 120 minutes of
 * sleep later. On the reap clock it reads 5 minutes old at the retry moment and
 * sails through a 2h cap; on the request clock it reads 125 minutes and is
 * correctly skipped. This pair is the whole LAC-4608 finding.
 */
const lac4210 = reaped({
  identifier: "LAC-4210",
  originKind: "manual",
  title: "a run requested two hours before it was reaped",
  requestedAtMs: Date.parse("2026-10-08T04:52:16.225Z"),
  diedAtMs: Date.parse("2026-10-08T06:52:32.390Z"),
});

describe("decide", () => {
  it("retries the LAC-4564 reap that started this chain", () => {
    expect(decide(lac4564, Date.parse("2026-10-16T09:34:00.000Z"))).toEqual({ action: "retry" });
  });

  it("retries a reaped slot once the grace window has passed", () => {
    expect(decide(reaped(), NOW)).toEqual({ action: "retry" });
  });

  it("holds off while the server's own recovery still has the ball", () => {
    const decision = decide(reaped({ diedAtMs: minutesAgo(1) }), NOW);
    expect(decision).toMatchObject({ action: "skip", reason: "grace" });
  });

  it("will not draft yesterday's plan", () => {
    // A stale re-run is worse than no re-run: the slot's moment has passed and a
    // later slot has already covered the window.
    const old = reaped({ diedAtMs: minutesAgo(4 * 60), requestedAtMs: minutesAgo(4 * 60) });
    expect(decide(old, NOW)).toMatchObject({ action: "skip", reason: "stale" });
  });

  it("skips the real LAC-4210, stale by two hours the reap clock cannot see", () => {
    // Five minutes past the reap, so grace has passed and the reap clock reads
    // 5m. The request clock reads 125m, and that is the one that decides.
    const at = Date.parse("2026-10-08T06:57:32.390Z");
    expect(Math.round((at - lac4210.diedAtMs) / 60_000)).toBe(5);
    expect(Math.round((at - lac4210.requestedAtMs) / 60_000)).toBe(125);

    const decision = decide(lac4210, at);
    expect(decision).toMatchObject({ action: "skip", reason: "stale" });
    // The line has to carry both clocks or the skip is not diagnosable.
    expect(decision).toHaveProperty("detail", expect.stringContaining("requested 2.1h ago"));
    expect(decision).toHaveProperty("detail", expect.stringContaining("reaped 5m ago"));
  });

  it("still retries LAC-4564 on the request clock, 94m after its slot fired", () => {
    // The tightening must not cost the reaps this file exists for. LAC-4564 is
    // 94m old when the sweep reaches it, LAC-4006 was about 105m. Both inside 2h.
    const at = Date.parse("2026-10-16T09:34:00.000Z");
    expect(Math.round((at - lac4564.requestedAtMs) / 60_000)).toBe(94);
    expect(decide(lac4564, at)).toEqual({ action: "retry" });
  });

  it("would have passed LAC-4210 one minute before its successor on the reap clock", () => {
    // The counterfactual that makes this a fix and not a preference: 119 minutes
    // past the reap is 239 minutes past the request, and the fastest routine on
    // the board fires again at 240.
    const at = lac4210.diedAtMs + 119 * 60_000;
    expect(Math.round((at - lac4210.requestedAtMs) / 60_000)).toBe(239);
    expect(decide(lac4210, at)).toMatchObject({ action: "skip", reason: "stale" });
  });

  it.each(["done", "cancelled"])("leaves a %s issue alone", (issueStatus) => {
    expect(decide(reaped({ issueStatus }), NOW)).toMatchObject({
      action: "skip",
      reason: "issue_terminal",
    });
  });

  it("does not retry a run the server already retried", () => {
    expect(decide(reaped({ alreadyRetried: true }), NOW)).toMatchObject({
      action: "skip",
      reason: "already_retried",
    });
  });

  it("stands down when any later run already picked the issue up", () => {
    // Not the same condition as alreadyRetried: a later routine slot, a board
    // comment or a reassignment starts a fresh run that is nobody's retry.
    expect(decide(reaped({ newerRunForIssue: true }), NOW)).toMatchObject({
      action: "skip",
      reason: "superseded",
    });
  });

  it("never runs two things at once on one agent", () => {
    expect(decide(reaped({ agentBusy: true }), NOW)).toMatchObject({
      action: "skip",
      reason: "agent_busy",
    });
  });

  it.each([
    "paused",
    "terminated",
    "pending_approval",
  ])("respects the %s operator hold", (agentStatus) => {
    expect(decide(reaped({ agentStatus }), NOW)).toMatchObject({
      action: "skip",
      reason: "operator_hold",
    });
  });

  it.each(["idle", "active", "running", "error"])("still retries for a %s agent", (agentStatus) => {
    // `error` is invokable in Paperclip, and a lease loss is a common way for an
    // agent to be left in it. Skipping those would skip the fleet's worst hours.
    expect(decide(reaped({ agentStatus }), NOW)).toEqual({ action: "retry" });
  });

  it("skips a run that carries no issue", () => {
    expect(decide(reaped({ identifier: "" }), NOW)).toMatchObject({
      action: "skip",
      reason: "no_issue",
    });
  });

  it("reports the permanent reason first when several guards apply at once", () => {
    // A cancelled issue will never be retryable; a busy agent will be on the next
    // pass. The log has to say which, or a miss cannot be diagnosed (LAC-4543).
    const decision = decide(reaped({ issueStatus: "cancelled", agentBusy: true }), NOW);
    expect(decision).toMatchObject({ action: "skip", reason: "issue_terminal" });
  });

  it("honours a widened window without widening the grace", () => {
    const old = reaped({ diedAtMs: minutesAgo(10 * 60), requestedAtMs: minutesAgo(11 * 60) });
    expect(decide(old, NOW, { maxAgeHours: 24 })).toEqual({ action: "retry" });
    const fresh = reaped({ diedAtMs: minutesAgo(1), requestedAtMs: minutesAgo(1) });
    expect(decide(fresh, NOW, { maxAgeHours: 24 })).toMatchObject({ reason: "grace" });
  });

  it("retries only once per agent per pass", () => {
    // `agentBusy` is a snapshot taken before the loop, so it cannot see the retry
    // this pass just posted. CEO LAC-4270 and LAC-4271 were reaped 4 minutes
    // apart on 2026-10-12, both non-terminal, both for one agent.
    const run = reaped();
    expect(decide(run, NOW, { retriedAgentIds: new Set() })).toEqual({ action: "retry" });
    expect(decide(run, NOW, { retriedAgentIds: new Set([run.agentId]) })).toMatchObject({
      action: "skip",
      reason: "agent_retried_this_pass",
    });
  });

  it("does not hold up a second agent's reap", () => {
    const run = reaped({ agentId: "11111111-2222-4333-8444-555555555555" });
    expect(
      decide(run, NOW, { retriedAgentIds: new Set(["99999999-0000-4000-8000-000000000000"]) })
    ).toEqual({ action: "retry" });
  });

  it("prefers every durable reason over the pass-local one", () => {
    // `agent_retried_this_pass` clears in 5 minutes, so it must never be the
    // reason printed for a run that is also terminal, stale or superseded.
    const run = reaped({ issueStatus: "done" });
    expect(decide(run, NOW, { retriedAgentIds: new Set([run.agentId]) })).toMatchObject({
      reason: "issue_terminal",
    });
  });
});

describe("skipKey", () => {
  it("collapses the same skip to one line a day", () => {
    const run = reaped();
    expect(skipKey(run, "agent_busy", NOW)).toBe(skipKey(run, "agent_busy", NOW + 3_600_000));
  });

  it("speaks up when the reason changes", () => {
    const run = reaped();
    expect(skipKey(run, "agent_busy", NOW)).not.toBe(skipKey(run, "stale", NOW));
  });

  it("speaks up again the next day", () => {
    const run = reaped();
    expect(skipKey(run, "stale", NOW)).not.toBe(skipKey(run, "stale", NOW + 86_400_000));
  });
});

describe("pruneKeys", () => {
  it("keeps today and yesterday, drops the rest", () => {
    const keys = [
      "run-a:stale:2026-10-16",
      "run-b:stale:2026-10-15",
      "run-c:stale:2026-10-14",
      "run-d:stale:2026-09-01",
    ];
    expect(pruneKeys(keys, NOW)).toEqual(["run-a:stale:2026-10-16", "run-b:stale:2026-10-15"]);
  });

  it("survives an empty file", () => {
    expect(pruneKeys([], NOW)).toEqual([]);
  });
});

describe("formatAge", () => {
  it("uses minutes while minutes are the deciding unit", () => {
    expect(formatAge(minutesAgo(94), NOW)).toBe("1.6h");
    expect(formatAge(minutesAgo(30), NOW)).toBe("30m");
    expect(formatAge(minutesAgo(89), NOW)).toBe("89m");
  });
});

describe("describe", () => {
  it("says routine slot, because a missed slot is the whole problem", () => {
    expect(describeRun(lac4564)).toBe(
      "LAC-4564 (routine slot, Founding Engineer): Doug store watch (every 4h, read-only)"
    );
  });

  it("falls back to issue for manual work", () => {
    expect(describeRun(reaped({ originKind: "manual", identifier: "LAC-4007" }))).toContain(
      "LAC-4007 (issue, Founding Engineer)"
    );
  });
});

describe("constants", () => {
  it("matches the reaper's error string exactly", () => {
    // Matched literally in SQL. A substring match would also catch unrelated
    // lease failures that are not safe to blind-retry.
    expect(LEASE_LOST_ERROR).toBe("Legacy controller lease lost");
  });

  it("keeps the window inside the fastest routine's period", () => {
    // The Doug store watch is 4-hourly. Staying under that is what lets this file
    // drop the per-routine supersession check entirely.
    expect(MAX_AGE_HOURS).toBeLessThan(4);
    expect(GRACE_MINUTES).toBeGreaterThan(0);
    expect(GRACE_MINUTES * 60).toBeLessThan(MAX_AGE_HOURS * 3_600);
  });
});
