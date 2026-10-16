import { describe, expect, it } from "vitest";
import {
  alertKey,
  type BlockedIssue,
  classify,
  formatAge,
  formatAlert,
  GRACE_MINUTES,
  MAX_NAMED,
  nextState,
  stranded,
  unreported,
} from "../../../scripts/paperclip-stranded-watch";

const NOW = Date.parse("2026-10-16T18:00:00.000Z");
const minutesAgo = (m: number) => NOW - m * 60_000;

const issue = (over: Partial<BlockedIssue> & { identifier: string }): BlockedIssue => ({
  title: "a task",
  assignee: "Founding Engineer",
  strandedSinceMs: minutesAgo(120),
  recoveryCause: "",
  recoveryOwner: "",
  hasDescriptor: false,
  ...over,
});

/** The real LAC-4564: killed mid-setup, parked by the platform, nobody told. */
const escalated = issue({
  identifier: "LAC-4564",
  title: "Doug store watch (every 4h, read-only)",
  recoveryCause: "stranded_assigned_issue",
  recoveryOwner: "board",
  strandedSinceMs: Date.parse("2026-10-16T13:29:17.000Z"),
});

describe("classify", () => {
  it("separates a platform escalation from an issue with no wake path", () => {
    const verdict = classify([escalated, issue({ identifier: "LAC-3612" })], NOW);
    expect(verdict.escalated.map((i) => i.identifier)).toEqual(["LAC-4564"]);
    expect(verdict.orphaned.map((i) => i.identifier)).toEqual(["LAC-3612"]);
  });

  it("leaves a declared wait alone", () => {
    // LAC-4251 is blocked on Travis's printer answers, with the owner and the
    // thing written down. A person parked that on purpose. Alerting on it would
    // bury the hundred cases where nobody chose anything.
    const verdict = classify([issue({ identifier: "LAC-4251", hasDescriptor: true })], NOW);
    expect(verdict.declared.map((i) => i.identifier)).toEqual(["LAC-4251"]);
    expect(stranded(verdict)).toEqual([]);
  });

  it("still escalates a descriptor whose action was handed to the board", () => {
    // The real LAC-4085: the descriptor said "when LAC-4177 resolves, re-record",
    // LAC-4177 went done, and the issue stayed parked under a board-owned
    // `stranded_assigned_issue` because `blocked` wakes nobody. A declared wait
    // whose condition came true is the exact case this check exists for.
    const verdict = classify(
      [
        issue({
          identifier: "LAC-4085",
          recoveryCause: "stranded_assigned_issue",
          recoveryOwner: "board",
          hasDescriptor: true,
        }),
      ],
      NOW
    );
    expect(verdict.escalated.map((i) => i.identifier)).toEqual(["LAC-4085"]);
    expect(verdict.declared).toEqual([]);
  });

  it("leaves a declared wait alone when the platform only restated it", () => {
    // The real LAC-3980: waiting on Janet Harriman's reply, owner and condition
    // written down, and `deliberate_wait_without_target` filed against the agent
    // itself. One wait described twice, not an escalation. It reported as one for
    // a week (LAC-4573).
    const verdict = classify(
      [
        issue({
          identifier: "LAC-3980",
          recoveryCause: "deliberate_wait_without_target",
          recoveryOwner: "agent",
          hasDescriptor: true,
        }),
      ],
      NOW
    );
    expect(verdict.declared.map((i) => i.identifier)).toEqual(["LAC-3980"]);
    expect(stranded(verdict)).toEqual([]);
  });

  it("holds its fire inside the grace window and fires just past it", () => {
    // A park seconds old is still the platform's own business: revalidation
    // clears a transient one, and an agent mid-PATCH holds it for a moment.
    const young = issue({ identifier: "LAC-1", strandedSinceMs: minutesAgo(GRACE_MINUTES - 1) });
    const old = issue({ identifier: "LAC-2", strandedSinceMs: minutesAgo(GRACE_MINUTES + 1) });
    const verdict = classify([young, old], NOW);
    expect(verdict.young).toBe(1);
    expect(stranded(verdict).map((i) => i.identifier)).toEqual(["LAC-2"]);
  });

  it("reports one issue once even if the join hands it over twice", () => {
    const verdict = classify([escalated, { ...escalated }], NOW);
    expect(verdict.escalated).toHaveLength(1);
  });

  it("says nothing about a board with nothing parked", () => {
    // The empty state, and the one this check hopes to print every 15 minutes.
    const verdict = classify([], NOW);
    expect(stranded(verdict)).toEqual([]);
    expect(verdict.young).toBe(0);
  });
});

describe("stranded", () => {
  it("puts the newest park first, so the top line is the one worth reading", () => {
    const old = issue({ identifier: "LAC-2323", strandedSinceMs: minutesAgo(120_000) });
    expect(stranded(classify([old, escalated], NOW)).map((i) => i.identifier)).toEqual([
      "LAC-4564",
      "LAC-2323",
    ]);
  });
});

describe("alertKey", () => {
  it("does not drift while one park lasts, so the repeat check stays quiet", () => {
    expect(alertKey(escalated)).toBe("LAC-4564@2026-10-16T13:29:17.000Z");
  });

  it("changes when the same issue parks again after recovering", () => {
    const parkedAgain = { ...escalated, strandedSinceMs: NOW };
    expect(alertKey(parkedAgain)).not.toBe(alertKey(escalated));
  });
});

describe("unreported", () => {
  it("is everything on the first look", () => {
    expect(unreported([escalated], []).map((i) => i.identifier)).toEqual(["LAC-4564"]);
  });

  it("is nothing on the second look at the same park", () => {
    // A 15-minute check that re-DMs every cycle turns one stall into 96 identical
    // messages a day, and then the next real one gets ignored.
    expect(unreported([escalated], [alertKey(escalated)])).toEqual([]);
  });

  it("is the new one when a second issue parks alongside a known one", () => {
    const second = issue({ identifier: "LAC-4007", recoveryCause: "stranded_assigned_issue" });
    expect(unreported([escalated, second], [alertKey(escalated)]).map((i) => i.identifier)).toEqual(
      ["LAC-4007"]
    );
  });
});

describe("nextState", () => {
  it("keeps only the parks that are still live, so the file stays small", () => {
    const keys = nextState([escalated]);
    expect(keys).toEqual([alertKey(escalated)]);
  });

  it("is stable in order, so the file does not churn between cycles", () => {
    const a = issue({ identifier: "LAC-1" });
    const b = issue({ identifier: "LAC-2" });
    expect(nextState([a, b])).toEqual(nextState([b, a]));
  });
});

describe("formatAlert", () => {
  const verdict = classify([escalated, issue({ identifier: "LAC-3612", assignee: "CTO" })], NOW);

  it("counts the backlog on the first run instead of listing it", () => {
    // 128 identifiers in a DM is not a message anyone reads. The baseline says
    // how bad it is and promises one line per new one from here.
    const line = formatAlert(verdict, stranded(verdict), NOW, true);
    expect(line).toBe(
      "Fleet work is parked with nobody told: 2 issues (1 waiting on a board decision that was never sent, " +
        "1 with no wake path at all). Recorded as the baseline. From here you get one line per new one."
    );
  });

  it("names the new park, why it is parked, and how long it has been", () => {
    const line = formatAlert(verdict, [escalated], NOW, false);
    expect(line).toBe(
      "1 issue just went quiet with nobody told:\n" +
        "LAC-4564 (Founding Engineer, 4.5h, stranded_assigned_issue): Doug store watch (every 4h, read-only)\n" +
        "Parked in total: 2."
    );
  });

  it("calls an issue with no recovery action what it is", () => {
    const orphan = classify([issue({ identifier: "LAC-3612", assignee: "CTO" })], NOW);
    expect(formatAlert(orphan, stranded(orphan), NOW, false)).toContain(
      "LAC-3612 (CTO, 2h, no wake path): a task"
    );
  });

  it("stops naming them past the readable limit and says how many are left", () => {
    const many = Array.from({ length: MAX_NAMED + 3 }, (_, i) =>
      issue({ identifier: `LAC-${i}`, recoveryCause: "stranded_assigned_issue" })
    );
    const line = formatAlert(classify(many, NOW), many, NOW, false);
    expect(line).toContain(`${MAX_NAMED + 3} issues just went quiet`);
    expect(line).toContain("+3 more");
    expect(line.split("\n")).toHaveLength(MAX_NAMED + 3);
  });

  it("names an unassigned issue as unassigned rather than printing a blank", () => {
    const nobody = classify([issue({ identifier: "LAC-9", assignee: "" })], NOW);
    expect(formatAlert(nobody, stranded(nobody), NOW, false)).toContain("LAC-9 (unassigned,");
  });
});

describe("formatAge", () => {
  it("counts in days once a park is a day old", () => {
    expect(formatAge(NOW - 86_400_000, NOW)).toBe("1d");
    expect(formatAge(Date.parse("2026-07-21T13:03:00.000Z"), NOW)).toBe("87d");
  });

  it("keeps hours while the park is still today's problem", () => {
    expect(formatAge(NOW - 2 * 3_600_000, NOW)).toBe("2h");
    expect(formatAge(NOW - 9_000_000, NOW)).toBe("2.5h");
  });
});

describe("GRACE_MINUTES", () => {
  it("is far past any transient park and far inside the slowest cadence watched", () => {
    expect(GRACE_MINUTES).toBe(30);
  });
});
