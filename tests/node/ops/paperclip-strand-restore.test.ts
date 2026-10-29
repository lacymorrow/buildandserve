import { describe, expect, it } from "vitest";
import {
  decide,
  describe as describePark,
  formatAge,
  GRACE_MINUTES,
  MAX_AGENT_QUEUE,
  MAX_PER_PASS,
  MAX_RESTORES_PER_ISSUE,
  pruneState,
  RESTORABLE_PREVIOUS,
  RESTORE_STATUS,
  STATE_RETENTION_DAYS,
  STRANDED_CAUSE,
  type StrandedPark,
  type SweepState,
  skipKey,
} from "../../../scripts/paperclip-strand-restore";

const NOW = Date.parse("2026-10-20T17:30:00.000Z");
const minutesAgo = (m: number) => NOW - m * 60_000;
const daysAgo = (d: number) => NOW - d * 86_400_000;

const FOUNDING = "11111111-2222-4333-8444-555555555555";
const BACKEND = "66666666-7777-4888-8999-aaaaaaaaaaaa";

const park = (over: Partial<StrandedPark> = {}): StrandedPark => ({
  actionId: "0b1d5529-c421-412a-8a71-014e61287bae",
  issueId: "d5beaa47-7d9c-4862-b692-5f5ce2b0402f",
  identifier: "LAC-4837",
  title: "a parked issue",
  issueStatus: "blocked",
  originKind: "manual",
  previousStatus: "todo",
  parkedAtMs: minutesAgo(60),
  ownerAgentId: FOUNDING,
  ownerAgentName: "Founding Engineer",
  ownerAgentStatus: "idle",
  ownerQueueDepth: 0,
  newerRunForIssue: false,
  liveBlockerCount: 0,
  hasUnblockDescriptor: false,
  pendingCardCount: 0,
  otherActiveActionCause: "",
  ...over,
});

/**
 * The real LAC-4837, the park this file exists for and the one it was verified on.
 * Killed by the 2026-10-18 07:00:31Z bulk pause, still parked two days later with
 * nobody told. Restored to `todo` at 17:21Z: the status held, the recovery action
 * cancelled itself as stale, and the platform queued a run 0.5s later.
 */
const lac4837 = park({
  identifier: "LAC-4837",
  title: "Remove dead useDockSlot and correct the barDock store comment",
  previousStatus: "todo",
  parkedAtMs: Date.parse("2026-10-18T07:00:31.727Z"),
});

/**
 * The real LAC-3818, one of the five parks from the same pause whose recovery
 * action recorded `in_progress`. The run behind that status was cancelled
 * `agent_paused`, so there is nothing in progress and `todo` is the accurate
 * restatement. This is the case the header's status decision is about.
 */
const lac3818 = park({
  identifier: "LAC-3818",
  title: "Clean up ~15 dead env vars in env.ts (zero readers)",
  previousStatus: "in_progress",
  parkedAtMs: Date.parse("2026-10-18T07:00:33.083Z"),
});

/**
 * The real LACA-1512, a Banks trading-loop slot parked seven times over. A routine
 * slot is superseded by its next slot, so restoring it would report a window
 * something else already covered. Its owner is also still paused, which is a
 * second independent reason to leave it alone.
 */
const laca1512 = park({
  identifier: "LACA-1512",
  title: "Banks — market-hours trading loop",
  originKind: "routine_execution",
  previousStatus: "in_progress",
  ownerAgentName: "Banks",
  ownerAgentStatus: "paused",
  parkedAtMs: Date.parse("2026-09-15T18:40:37.031Z"),
});

describe("decide", () => {
  it("restores the LAC-4837 park this chain was opened for", () => {
    expect(decide(lac4837, NOW)).toEqual({ action: "restore" });
  });

  it("restores a park whose recovery action recorded in_progress", () => {
    expect(decide(lac3818, NOW)).toEqual({ action: "restore" });
  });

  it("does not restore a routine slot, which its next slot supersedes", () => {
    expect(decide(laca1512, NOW)).toMatchObject({ action: "skip", reason: "routine_slot" });
  });

  it("has no maximum age, so a park days old is still restored", () => {
    // The whole reason LAC-4586's 2h cap could not be copied over: every park this
    // exists for is older than it.
    expect(decide(park({ parkedAtMs: daysAgo(14) }), NOW)).toEqual({ action: "restore" });
  });

  it("skips a park younger than the grace window", () => {
    expect(decide(park({ parkedAtMs: minutesAgo(GRACE_MINUTES - 1) }), NOW)).toMatchObject({
      action: "skip",
      reason: "grace",
    });
  });

  it("restores a park that has just cleared the grace window", () => {
    expect(decide(park({ parkedAtMs: minutesAgo(GRACE_MINUTES + 1) }), NOW)).toEqual({
      action: "restore",
    });
  });

  it("skips an issue that is no longer parked", () => {
    expect(decide(park({ issueStatus: "in_progress" }), NOW)).toMatchObject({
      action: "skip",
      reason: "not_parked",
    });
  });

  it("will not write todo over an in_review park", () => {
    // `todo` would send the engineer back into work a reviewer already holds.
    expect(decide(park({ previousStatus: "in_review" }), NOW)).toMatchObject({
      action: "skip",
      reason: "previous_status_not_restorable",
    });
  });

  it("will not write todo over a backlog park", () => {
    expect(decide(park({ previousStatus: "backlog" }), NOW)).toMatchObject({
      action: "skip",
      reason: "previous_status_not_restorable",
    });
  });

  it("skips a park whose recovery action recorded no previous status", () => {
    expect(decide(park({ previousStatus: "" }), NOW)).toMatchObject({
      action: "skip",
      reason: "previous_status_not_restorable",
    });
  });

  it("leaves a genuinely blocked issue blocked", () => {
    expect(decide(park({ liveBlockerCount: 2 }), NOW)).toMatchObject({
      action: "skip",
      reason: "live_blocker",
    });
  });

  it("leaves a park whose assignee named themselves the unblock owner", () => {
    expect(decide(park({ hasUnblockDescriptor: true }), NOW)).toMatchObject({
      action: "skip",
      reason: "assignee_owns_unblock",
    });
  });

  it("leaves a park that also carries a different recovery cause", () => {
    // `configuration_incomplete` needs a human and the platform re-parks it
    // seconds after any write.
    expect(decide(park({ otherActiveActionCause: "configuration_incomplete" }), NOW)).toMatchObject(
      { action: "skip", reason: "other_recovery_action" }
    );
  });

  it("will not wake an assignee into a pending human card", () => {
    expect(decide(park({ pendingCardCount: 1 }), NOW)).toMatchObject({
      action: "skip",
      reason: "pending_card",
    });
  });

  it("skips a park something else already resumed", () => {
    expect(decide(park({ newerRunForIssue: true }), NOW)).toMatchObject({
      action: "skip",
      reason: "superseded",
    });
  });

  it("does not fight an operator hold that is still in force", () => {
    for (const status of ["paused", "terminated", "pending_approval"]) {
      expect(decide(park({ ownerAgentStatus: status }), NOW)).toMatchObject({
        action: "skip",
        reason: "owner_on_hold",
      });
    }
  });

  it("restores once the hold is lifted and the owner is healthy again", () => {
    // The bug in one assertion: same park, same age, the only change is that the
    // operator un-paused the owner.
    expect(decide(park({ ownerAgentStatus: "paused" }), NOW)).toMatchObject({ action: "skip" });
    expect(decide(park({ ownerAgentStatus: "running" }), NOW)).toEqual({ action: "restore" });
  });

  it("skips a park with no owner, which todo alone would not wake", () => {
    expect(decide(park({ ownerAgentId: "", ownerAgentName: "" }), NOW)).toMatchObject({
      action: "skip",
      reason: "no_owner",
    });
  });

  it("restores into a busy owner that still has queue headroom", () => {
    // Headroom, not idleness. An idleness test would never drain the owner that
    // holds six of the eight live parks, because those parks are why it is busy.
    expect(decide(park({ ownerQueueDepth: MAX_AGENT_QUEUE - 1 }), NOW)).toEqual({
      action: "restore",
    });
  });

  it("skips an owner whose queue is already full", () => {
    expect(decide(park({ ownerQueueDepth: MAX_AGENT_QUEUE }), NOW)).toMatchObject({
      action: "skip",
      reason: "agent_queue_full",
    });
  });

  it("restores at most one park per owner per pass", () => {
    expect(decide(park(), NOW, { restoredAgentIds: new Set([FOUNDING]) })).toMatchObject({
      action: "skip",
      reason: "agent_restored_this_pass",
    });
    expect(
      decide(park({ ownerAgentId: BACKEND }), NOW, {
        restoredAgentIds: new Set([FOUNDING]),
      })
    ).toEqual({ action: "restore" });
  });

  it("stops at the per-pass cap even across different owners", () => {
    expect(decide(park(), NOW, { restoredThisPass: MAX_PER_PASS })).toMatchObject({
      action: "skip",
      reason: "pass_cap_reached",
    });
    expect(decide(park(), NOW, { restoredThisPass: MAX_PER_PASS - 1 })).toEqual({
      action: "restore",
    });
  });

  it("gives up on an issue that re-parks after its attempts are spent", () => {
    expect(decide(park(), NOW, { priorRestores: MAX_RESTORES_PER_ISSUE })).toMatchObject({
      action: "skip",
      reason: "restore_exhausted",
    });
    expect(decide(park(), NOW, { priorRestores: MAX_RESTORES_PER_ISSUE - 1 })).toEqual({
      action: "restore",
    });
  });

  it("reports the most permanent reason when several guards fail at once", () => {
    // Ordering is the contract: a park skipped for `live_blocker` will not become
    // restorable on its own, one skipped for `agent_queue_full` very likely will.
    expect(
      decide(park({ liveBlockerCount: 1, ownerQueueDepth: 9, ownerAgentStatus: "paused" }), NOW)
    ).toMatchObject({ reason: "live_blocker" });
  });

  it("prefers the operator hold over the queue depth it causes", () => {
    expect(decide(park({ ownerAgentStatus: "paused", ownerQueueDepth: 9 }), NOW)).toMatchObject({
      reason: "owner_on_hold",
    });
  });
});

describe("constants", () => {
  it("writes only todo, and only over the two statuses that mean unstarted work", () => {
    expect(RESTORE_STATUS).toBe("todo");
    expect([...RESTORABLE_PREVIOUS].sort()).toEqual(["in_progress", "todo"]);
  });

  it("owns one recovery cause, matched literally", () => {
    expect(STRANDED_CAUSE).toBe("stranded_assigned_issue");
  });
});

describe("formatAge", () => {
  it("reads in minutes inside 90 minutes", () => {
    expect(formatAge(minutesAgo(45), NOW)).toBe("45m");
  });

  it("reads in hours between 90 minutes and 36 hours", () => {
    expect(formatAge(minutesAgo(240), NOW)).toBe("4h");
  });

  it("reads in days past 36 hours, which is how these parks are measured", () => {
    expect(formatAge(Date.parse("2026-10-18T07:00:31.727Z"), NOW)).toBe("2.4d");
  });
});

describe("describe", () => {
  it("names the issue and the owner the restore depends on", () => {
    expect(describePark(lac4837)).toBe(
      "LAC-4837 (Founding Engineer): Remove dead useDockSlot and correct the barDock store comment"
    );
  });

  it("says unassigned rather than printing an empty owner", () => {
    expect(describePark(park({ ownerAgentName: "" }))).toContain("(unassigned)");
  });
});

describe("skipKey", () => {
  it("is one key per issue per reason per day", () => {
    expect(skipKey(lac4837, "grace", NOW)).toBe(`${lac4837.issueId}:grace:2026-10-20`);
  });

  it("changes the moment the reason changes, so a new reason is never muted", () => {
    expect(skipKey(lac4837, "grace", NOW)).not.toBe(skipKey(lac4837, "owner_on_hold", NOW));
  });

  it("changes the next day, so a persistent skip is re-stated once a day", () => {
    expect(skipKey(lac4837, "grace", NOW)).not.toBe(skipKey(lac4837, "grace", NOW + 86_400_000));
  });
});

describe("pruneState", () => {
  const state = (over: Partial<SweepState> = {}): SweepState => ({
    restores: {},
    skipKeys: [],
    ...over,
  });

  it("keeps a restore count inside the retention window", () => {
    const pruned = pruneState(
      state({ restores: { a: { count: 2, lastAtMs: daysAgo(STATE_RETENTION_DAYS - 1) } } }),
      NOW
    );
    expect(pruned.restores.a?.count).toBe(2);
  });

  it("gives an issue its attempts back once the count ages out", () => {
    // An issue that strands again next month should not inherit an exhausted
    // counter from a fault that was fixed weeks ago.
    const pruned = pruneState(
      state({ restores: { a: { count: 3, lastAtMs: daysAgo(STATE_RETENTION_DAYS + 1) } } }),
      NOW
    );
    expect(pruned.restores).toEqual({});
  });

  it("keeps skip keys from today and yesterday only", () => {
    const pruned = pruneState(
      state({ skipKeys: ["i:grace:2026-10-20", "i:grace:2026-10-19", "i:grace:2026-10-01"] }),
      NOW
    );
    expect(pruned.skipKeys).toEqual(["i:grace:2026-10-19", "i:grace:2026-10-20"]);
  });

  it("survives a state file with neither key present", () => {
    expect(pruneState({ restores: {}, skipKeys: [] }, NOW)).toEqual({
      restores: {},
      skipKeys: [],
    });
  });
});
