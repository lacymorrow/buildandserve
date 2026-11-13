import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  alertKey,
  type BlockedIssue,
  CONVERSATION_ADAPTER_TYPES,
  classify,
  classifyDeferred,
  DEPLOY_KEY_PREFIX,
  type DeferredWake,
  type DeployState,
  deferredKey,
  deployKey,
  describeDeferred,
  EXECUTION_RECONCILIATION_CAUSES,
  EXIT_COULD_NOT_LOOK,
  EXIT_PARKED,
  EXIT_QUIET,
  FETCH_KEY_PREFIX,
  FETCH_STALE_HOURS,
  fetchKey,
  formatAge,
  formatAlert,
  formatBlindAlert,
  formatDeferredAlert,
  formatDeployAlert,
  formatFetchAlert,
  GRACE_MINUTES,
  MAX_NAMED,
  mergeHold,
  nextDeferredState,
  nextState,
  type OwnershipCandidate,
  type OwnershipHold,
  ownershipHold,
  type ProcessProbe,
  readDeployState,
  stranded,
  unreported,
  unreportedDeferred,
} from "../../../scripts/paperclip-stranded-watch";

const NOW = Date.parse("2026-10-16T18:00:00.000Z");
/** 40h before NOW: past FETCH_STALE_HOURS, so the fetch line must fire. */
const STALE_FETCH_AT = NOW - 40 * 3_600_000;
const minutesAgo = (m: number) => NOW - m * 60_000;

const issue = (over: Partial<BlockedIssue> & { identifier: string }): BlockedIssue => ({
  title: "a task",
  assignee: "Founding Engineer",
  strandedSinceMs: minutesAgo(120),
  recoveryCause: "",
  recoveryOwner: "",
  hasDescriptor: false,
  holdCause: "",
  holdNote: "",
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

  it("still escalates a system-owned park that happens to carry a descriptor", () => {
    // `owner_type` has three live values, not two: board, agent and system
    // (40 rows, measured 2026-11-04). `provider_quota` is system-owned. A
    // descriptor next to it is not the agent restating its own wait, it is a
    // quota exhaustion nobody has been told about, so "anything but board"
    // would have silenced it.
    const verdict = classify(
      [
        issue({
          identifier: "LAC-9001",
          recoveryCause: "provider_quota",
          recoveryOwner: "system",
          hasDescriptor: true,
        }),
      ],
      NOW
    );
    expect(verdict.escalated.map((i) => i.identifier)).toEqual(["LAC-9001"]);
    expect(verdict.declared).toEqual([]);
  });

  it("escalates an owner_type it has never seen rather than going quiet", () => {
    // The cost is asymmetric: a spurious line is one Lacy ignores, a missed one
    // is the 9.5h blind window this script exists for. A fourth owner type
    // added upstream must fail loud, not silent.
    const verdict = classify(
      [
        issue({
          identifier: "LAC-9002",
          recoveryCause: "some_future_cause",
          recoveryOwner: "operator",
          hasDescriptor: true,
        }),
      ],
      NOW
    );
    expect(verdict.escalated.map((i) => i.identifier)).toEqual(["LAC-9002"]);
    expect(verdict.declared).toEqual([]);
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

  // LAC-7846. The real LAC-5591: this lane printed it as "16d, no wake path"
  // on 2026-11-12 while an execution hold was what held it. The two want
  // opposite actions -- a status flip repairs the first and is reverted in
  // ~40s on the second, minting another blocked-replay row -- so one wording
  // for both sends the reader down the path that cannot work.
  it("says a held issue is held, and that only the board can clear it", () => {
    const held = classify(
      [
        issue({
          identifier: "LAC-5591",
          assignee: "Frontend Engineer",
          holdCause: "legacy_execution_requires_reconciliation",
        }),
      ],
      NOW
    );
    expect(formatAlert(held, stranded(held), NOW, false)).toContain(
      "LAC-5591 (Frontend Engineer, 2h, held by legacy_execution_requires_reconciliation, " +
        "board resolve only): a task"
    );
  });

  // The hold and the active recovery action are different rows answering
  // different questions, and on all 37 held issues measured 2026-11-12 the
  // active one was absent. Where both exist the hold wins the line, because it
  // is the one that decides whether the named owner can act at all.
  it("prefers the hold over an active recovery action when an issue has both", () => {
    const both = classify(
      [
        issue({
          identifier: "LAC-7800",
          recoveryCause: "stranded_assigned_issue",
          recoveryOwner: "board",
          holdCause: "legacy_execution_requires_reconciliation",
        }),
      ],
      NOW
    );
    const line = formatAlert(both, stranded(both), NOW, false);
    expect(line).toContain("held by legacy_execution_requires_reconciliation, board resolve only");
    expect(line).not.toContain("LAC-7800 (Founding Engineer, 2h, stranded_assigned_issue)");
  });

  // The park lane's hold column reads `issue_recovery_actions` only, and the
  // server checks that table SECOND. An issue held by the ownership arm has no
  // action row at all, so before LAC-8030 this lane printed `no wake path` for
  // an issue the server holds -- the LAC-7846 false negative surviving in the
  // arm LAC-7846 did not reach.
  it("names an ownership hold in the park lane instead of 'no wake path'", () => {
    const owned = classify(
      [
        issue({
          identifier: "LAC-5194",
          assignee: "Test Writer",
          holdCause: "execution_owner_active",
          holdNote:
            "process group 4242 alive; verify with ps -A -o pid,pgid,comm before stopping anything",
        }),
      ],
      NOW
    );
    const line = formatAlert(owned, stranded(owned), NOW, false);
    expect(line).toContain(
      "LAC-5194 (Test Writer, 2h, held by execution_owner_active (process group 4242 alive; " +
        "verify with ps -A -o pid,pgid,comm before stopping anything)): a task"
    );
    expect(line).not.toContain("no wake path");
  });

  // The two holds want different hands. A recovery-action hold is retired by a
  // board resolve; an ownership hold has no action row to resolve, so pointing
  // its reader at `recovery-actions/resolve` is an instruction that cannot be
  // carried out. The wording is the only thing that separates them in the DM.
  it("does not tell an ownership hold to board-resolve a row that does not exist", () => {
    const owned = classify(
      [
        issue({
          identifier: "LAC-6321",
          holdCause: "execution_owner_active",
          holdNote: "pid 4242 alive",
        }),
      ],
      NOW
    );
    expect(formatAlert(owned, stranded(owned), NOW, false)).not.toContain("board resolve only");
  });

  // Negative control for the two above: with no hold the wording must not
  // change, or they would pass against a describe() that said "held by" for
  // every row.
  it("leaves an unheld park worded exactly as before", () => {
    const plain = classify([issue({ identifier: "LAC-3612", assignee: "CTO" })], NOW);
    const line = formatAlert(plain, stranded(plain), NOW, false);
    expect(line).toContain("LAC-3612 (CTO, 2h, no wake path): a task");
    expect(line).not.toContain("board resolve only");
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

// ---------------------------------------------------------------------------
// The deferred-wake lane (LAC-6995). A wake recorded `deferred_issue_execution`
// tells its author the message is saved, and nothing ever starts it. Every row
// below is a real strand measured on the control plane on 2026-11-05.
// ---------------------------------------------------------------------------

const wake = (over: Partial<DeferredWake> & { identifier: string }): DeferredWake => ({
  title: "a task",
  assignee: "Founding Engineer",
  waiter: "Founding Engineer",
  savedCount: 1,
  oldestMs: minutesAgo(120),
  waitReason: "execution_recovery",
  holdCause: "legacy_execution_requires_reconciliation",
  holdNote: "",
  ...over,
});

/** The real LAC-6825: five saved messages, 22.8h, held by a resolved action. */
const heldStrand = wake({
  identifier: "LAC-6825",
  savedCount: 5,
  oldestMs: NOW - Math.round(22.8 * 3_600_000),
});

/**
 * The real LAC-2809: no execution blocker since 2026-10-17, a run on the issue
 * released at 2026-11-05 10:05Z, and the 2026-11-03 wake was still deferred
 * 40.5h later. Proof that promotion is edge-triggered and not even reliable
 * on the edge, so "hold already gone" has to stay reportable.
 */
const drainNeverRan = wake({
  identifier: "LAC-2809",
  assignee: "Marketing Lead",
  waiter: "Video Producer",
  holdCause: "",
  oldestMs: NOW - Math.round(40.5 * 3_600_000),
});

describe("classifyDeferred", () => {
  it("reports a strand past the grace and holds one that is still settling", () => {
    const verdict = classifyDeferred(
      [heldStrand, wake({ identifier: "LAC-6973", oldestMs: minutesAgo(5) })],
      NOW
    );
    expect(verdict.stranded.map((w) => w.identifier)).toEqual(["LAC-6825"]);
    expect(verdict.young).toBe(1);
  });

  it("uses the same grace as the park lane", () => {
    expect(
      classifyDeferred(
        [wake({ identifier: "LAC-1", oldestMs: minutesAgo(GRACE_MINUTES + 1) })],
        NOW
      ).stranded
    ).toHaveLength(1);
    expect(
      classifyDeferred(
        [wake({ identifier: "LAC-1", oldestMs: minutesAgo(GRACE_MINUTES - 1) })],
        NOW
      ).stranded
    ).toHaveLength(0);
  });

  it("reports a strand whose hold has already cleared", () => {
    // The drain is reached from exactly one caller, a run release. A cleared
    // hold does not start anything by itself, so this must not be filtered out
    // as healthy.
    expect(classifyDeferred([drainNeverRan], NOW).stranded.map((w) => w.identifier)).toEqual([
      "LAC-2809",
    ]);
  });

  it("puts the oldest strand first, because that is the one to answer", () => {
    const verdict = classifyDeferred([heldStrand, drainNeverRan], NOW);
    expect(verdict.stranded.map((w) => w.identifier)).toEqual(["LAC-2809", "LAC-6825"]);
  });
});

describe("deferredKey", () => {
  it("cannot collide with a park key for the same issue", () => {
    const parked = issue({ identifier: "LAC-6825", strandedSinceMs: heldStrand.oldestMs });
    expect(deferredKey(heldStrand)).not.toBe(alertKey(parked));
  });

  it("does not buy a second DM when another message piles onto a known strand", () => {
    // LAC-6825 went from 1 saved message to 5 over 22h. The strand is the
    // problem, so the key is the oldest wake and the count is only prose.
    expect(deferredKey({ ...heldStrand, savedCount: 9 })).toBe(deferredKey(heldStrand));
    expect(
      unreportedDeferred([{ ...heldStrand, savedCount: 9 }], nextDeferredState([heldStrand]))
    ).toEqual([]);
  });

  it("separates two agents waiting on the same issue", () => {
    // LAC-2809's saved wake belongs to the Video Producer while the issue is
    // assigned to the Marketing Lead. Two waiters are two strands.
    expect(deferredKey({ ...drainNeverRan, waiter: "Marketing Lead" })).not.toBe(
      deferredKey(drainNeverRan)
    );
  });

  it("re-reports the same issue after it strands a second time", () => {
    const later = { ...heldStrand, oldestMs: heldStrand.oldestMs + 60_000 };
    expect(unreportedDeferred([later], nextDeferredState([heldStrand]))).toEqual([later]);
  });
});

describe("describeDeferred", () => {
  it("names the hold, because clearing it is the action", () => {
    expect(describeDeferred(heldStrand, NOW)).toBe(
      "LAC-6825 (Founding Engineer, 22.8h, 5 messages saved, held by legacy_execution_requires_reconciliation): a task"
    );
  });

  it("names which ownership arm is holding, because that is a different repair", () => {
    const line = describeDeferred(
      wake({
        identifier: "LAC-6321",
        holdCause: "execution_owner_active",
        holdNote:
          "process group 591 alive, recorded pid 591 is recycled; verify with ps -A -o pid,pgid,comm before stopping anything",
      }),
      NOW
    );
    expect(line).toContain(
      "held by execution_owner_active (process group 591 alive, recorded pid 591 is recycled; verify with ps -A -o pid,pgid,comm before stopping anything)"
    );
  });

  it("says so when the hold is gone and the drain simply never ran", () => {
    expect(describeDeferred(drainNeverRan, NOW)).toContain(
      // 40.5h renders as 1d: past a day, the day count is the readable unit.
      "LAC-2809 (Video Producer, 1d, 1 message saved, execution_recovery, hold already gone)"
    );
  });

  it("distinguishes a wake deferred behind a run that died without releasing", () => {
    // The other producer: no `executionWait` key at all, because at deferral
    // time a live run existed and was expected to drain it. LAC-6250, LAC-6939.
    expect(
      describeDeferred(wake({ identifier: "LAC-6250", waitReason: "", holdCause: "" }), NOW)
    ).toContain("deferred behind a run that never released");
  });
});

// ---------------------------------------------------------------------------
// The ownership arm (LAC-7073). `getExecutionBlocker` checks this BEFORE it
// looks for a recovery action, so it can hold an issue that carries none --
// which the hold column used to print as "deferred behind a run that never
// released". Every branch below is one branch of
// `getConversationOwnershipBlocker` (`conversation-continuation.js:83-129`).
// ---------------------------------------------------------------------------

const candidate = (over: Partial<OwnershipCandidate> = {}): OwnershipCandidate => ({
  identifier: "LAC-4931",
  runId: "run-a",
  processPid: null,
  processGroupId: null,
  processStartedAtMs: null,
  leaseHeld: false,
  workspaceRecovery: false,
  retainedLeaseIds: [],
  remoteLeaseIds: [],
  receiptLeaseIds: [],
  hasLocalLease: false,
  ...over,
});

/**
 * `alive` holds the exact targets `process.kill` would be called with, so a
 * group probe has to pass `-pgid` to match. That sign is the difference
 * between the two arms and nothing else in the test can catch it.
 */
const probeOf = (alive: number[], observed: Record<number, number | null> = {}): ProcessProbe => ({
  mayBeAlive: (target) => alive.includes(target),
  startedAtMs: (pid) => observed[pid] ?? null,
});

const RECORDED = Date.parse("2026-11-03T08:40:36.000Z");

describe("ownershipHold", () => {
  it("holds on a live PID whose recorded start still matches the host", () => {
    const hold = ownershipHold(
      [candidate({ processPid: 4242, processStartedAtMs: RECORDED })],
      probeOf([4242], { 4242: RECORDED })
    );
    expect(hold).toEqual({
      runId: "run-a",
      cause: "execution_owner_active",
      note: "pid 4242 alive",
    });
  });

  it("lets a dead PID go, because a gone process owns nothing", () => {
    expect(
      ownershipHold([candidate({ processPid: 4242, processStartedAtMs: RECORDED })], probeOf([]))
    ).toBeNull();
  });

  it("rejects a recycled PID instead of holding the issue forever", () => {
    expect(
      ownershipHold(
        [candidate({ processPid: 591, processStartedAtMs: RECORDED })],
        probeOf([591], { 591: Date.parse("2026-11-04T11:01:21.000Z") })
      )
    ).toBeNull();
  });

  /**
   * The real LAC-6321, and the case that made this issue worth building. Its
   * run recorded pid == pgid == 591, `locationd` holds that group id today,
   * the PID arm correctly calls it recycled -- and the GROUP arm has no
   * recycled-id check available to it, so the server holds anyway. LAC-7022
   * probed the PID arm only and concluded "0 ownership holds on the board".
   */
  it("still holds on the process group when the same recycled id is the group leader", () => {
    const hold = ownershipHold(
      [candidate({ processPid: 591, processGroupId: 591, processStartedAtMs: RECORDED })],
      probeOf([591, -591], { 591: Date.parse("2026-11-04T11:01:21.000Z") })
    );
    expect(hold?.cause).toBe("execution_owner_active");
    expect(hold?.note).toBe(
      "process group 591 alive, recorded pid 591 is recycled; verify with ps -A -o pid,pgid,comm before stopping anything"
    );
  });

  it("stays conservative when the host start time cannot be read at all", () => {
    const hold = ownershipHold(
      [candidate({ processPid: 4242, processStartedAtMs: RECORDED })],
      probeOf([4242], { 4242: null })
    );
    expect(hold?.note).toBe("pid 4242 alive");
  });

  it("holds on a lease that was never released, with no process in sight", () => {
    const hold = ownershipHold([candidate({ leaseHeld: true })], probeOf([]));
    expect(hold?.note).toBe("environment lease not released");
  });

  it("says nothing about a candidate carrying none of the four signals", () => {
    expect(ownershipHold([candidate({ processPid: 4242 })], probeOf([]))).toBeNull();
    expect(ownershipHold([], probeOf([4242]))).toBeNull();
  });

  it("holds a retained workspace before it looks at any process", () => {
    // A live PID is present on purpose: if the workspace branch fell through,
    // the note would name the process instead.
    const hold = ownershipHold(
      [candidate({ workspaceRecovery: true, processPid: 4242 })],
      probeOf([4242])
    );
    expect(hold?.note).toBe("retained remote workspace has not confirmed it stopped");
  });

  it("holds a retained workspace whose remote lease has no termination receipt", () => {
    const hold = ownershipHold(
      [
        candidate({
          workspaceRecovery: true,
          retainedLeaseIds: ["lease-1"],
          remoteLeaseIds: ["lease-1", "lease-2"],
          receiptLeaseIds: ["lease-1"],
        }),
      ],
      probeOf([])
    );
    expect(hold?.note).toBe("retained remote workspace has not confirmed it stopped");
  });

  it("skips a confirmed sandbox run rather than blaming this host's processes", () => {
    // Every remote lease produced a receipt and no local lease exists, so the
    // recorded PID came from the sandbox and a match here is somebody else.
    const sandbox = candidate({
      runId: "run-sandbox",
      workspaceRecovery: true,
      retainedLeaseIds: ["lease-1"],
      remoteLeaseIds: ["lease-1"],
      receiptLeaseIds: ["lease-1"],
      hasLocalLease: false,
      processPid: 4242,
    });
    expect(ownershipHold([sandbox], probeOf([4242]))).toBeNull();
    // ...and the loop carries on to the next candidate, which does hold.
    const hold = ownershipHold(
      [sandbox, candidate({ runId: "run-b", leaseHeld: true })],
      probeOf([4242])
    );
    expect(hold?.runId).toBe("run-b");
  });

  it("keeps checking this host when a confirmed run also held a local lease", () => {
    const hold = ownershipHold(
      [
        candidate({
          workspaceRecovery: true,
          retainedLeaseIds: ["lease-1"],
          remoteLeaseIds: ["lease-1"],
          receiptLeaseIds: ["lease-1"],
          hasLocalLease: true,
          processPid: 4242,
        }),
      ],
      probeOf([4242])
    );
    expect(hold?.note).toBe("pid 4242 alive");
  });

  it("reports the first candidate that holds, which is the newest run", () => {
    const hold = ownershipHold(
      [
        candidate({ runId: "newest", processGroupId: 961 }),
        candidate({ runId: "older", processGroupId: 1878 }),
      ],
      probeOf([-961, -1878])
    );
    expect(hold?.runId).toBe("newest");
  });
});

/**
 * The precedence the two lanes share (LAC-8030). It lived inside `readBoard`'s
 * deferred mapper, which needs a live Postgres connection, so nothing could
 * assert it -- and the park lane shipped a release without it while every test
 * stayed green.
 */
describe("mergeHold", () => {
  const owned: OwnershipHold = {
    runId: "run-1",
    cause: "execution_owner_active",
    note: "process group 4242 alive",
  };

  // `getExecutionBlocker` calls `getConversationOwnershipBlocker` first and
  // returns its blocker directly, so with both present the recovery action is
  // NOT what the server would report. Getting this backwards names the wrong
  // cause and sends the reader to a board resolve that would not clear it.
  it("reports the ownership hold when an issue carries both", () => {
    expect(mergeHold("legacy_execution_requires_reconciliation", owned)).toEqual({
      cause: "execution_owner_active",
      note: "process group 4242 alive",
    });
  });

  it("falls back to the recovery-action cause when nothing owns execution", () => {
    expect(mergeHold("legacy_execution_requires_reconciliation", null)).toEqual({
      cause: "legacy_execution_requires_reconciliation",
      note: "",
    });
  });

  it("reports the ownership hold on an issue with no recovery action at all", () => {
    expect(mergeHold("", owned).cause).toBe("execution_owner_active");
  });

  // The "no hold" answer has to stay empty in both fields, because an empty
  // cause is what `describe` reads as "no wake path" and a note without a cause
  // would print nowhere.
  it("says nothing when neither arm holds", () => {
    expect(mergeHold("", null)).toEqual({ cause: "", note: "" });
  });
});

/**
 * Source-level guard for the half of LAC-8030 that no unit test can reach:
 * `readBoard` needs a live control plane, so the wiring is asserted as text.
 * The defect it closes was not a wrong line of logic but a lane that never
 * called the logic at all.
 */
describe("both lanes are wired to the ownership arm (LAC-8030)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "../../../scripts/paperclip-stranded-watch.ts"),
    "utf8"
  );

  it("merges the two holds through one function, once per lane", () => {
    expect(source.match(/mergeHold\(/g) ?? []).toHaveLength(3); // definition + 2 lanes
  });

  it("probes ownership over both lanes' identifiers, not just the deferred one", () => {
    expect(source).toContain(
      "[...blockedRows, ...deferredRows].map((row) => String(row.identifier))"
    );
  });

  it("calls ownershipHold in one place, so the two lanes cannot disagree", () => {
    // Memoised per issue in `holdFor`: an issue both lanes name must get one
    // answer, and the probe shells out to `ps` for every live pid it meets.
    expect(source.match(/ownershipHold\(candidates\.get/g) ?? []).toHaveLength(1);
  });
});

describe("formatDeferredAlert", () => {
  it("counts the backlog on the first run instead of listing it", () => {
    const verdict = classifyDeferred([heldStrand, drainNeverRan], NOW);
    const line = formatDeferredAlert(verdict, verdict.stranded, NOW, true);
    expect(line).toContain("saved and never started: 2");
    expect(line).toContain("1 behind an execution hold");
    expect(line).toContain("1 behind a run that never released");
    expect(line).not.toContain("LAC-6825");
  });

  it("names the new strands and keeps the running total", () => {
    const verdict = classifyDeferred([heldStrand, drainNeverRan], NOW);
    const line = formatDeferredAlert(verdict, [heldStrand], NOW, false);
    expect(line).toContain("1 agent message was saved and will never start:");
    expect(line).toContain("LAC-6825 (Founding Engineer, 22.8h");
    expect(line).toContain("Saved and unstarted in total: 2.");
  });

  it("stops naming them past the readable limit", () => {
    const many = Array.from({ length: MAX_NAMED + 3 }, (_, i) => wake({ identifier: `LAC-${i}` }));
    const line = formatDeferredAlert(classifyDeferred(many, NOW), many, NOW, false);
    expect(line).toContain(`${MAX_NAMED + 3} agent messages were saved`);
    expect(line).toContain("+3 more");
  });

  it("names an unknown waiter rather than printing a blank", () => {
    expect(describeDeferred(wake({ identifier: "LAC-9", waiter: "" }), NOW)).toContain(
      "LAC-9 (unknown agent,"
    );
  });
});

describe("formatDeployAlert", () => {
  const state = (over: Partial<DeployState> = {}): DeployState => ({
    head: "a".repeat(40),
    originMain: "a".repeat(40),
    branch: "main",
    lastFetchMs: NOW,
    ...over,
  });

  it("says nothing when the running copy is origin/main", () => {
    expect(formatDeployAlert(state())).toBeNull();
  });

  it("names the branch and both commits when the running copy is not origin/main", () => {
    // The live 2026-11-05 case: the sweep ran this check from ~/repo/buildandserve,
    // parked on a feature branch with a copy dated 2026-10-17, while two merged
    // fixes to this very script sat on main unused.
    const line = formatDeployAlert(
      state({
        head: "a1ca77e5aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        originMain: "9a9be939bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        branch: "LAC-5692/brand-implementation",
      })
    );
    expect(line).toContain("a1ca77e5");
    expect(line).toContain("9a9be939");
    expect(line).toContain("LAC-5692/brand-implementation");
    expect(line).toContain("not origin/main");
  });

  it("reports an unreadable checkout rather than assuming it is current", () => {
    // Fail loud: "I cannot tell" must not read as "I am up to date", because the
    // whole report below it is only as trustworthy as the copy producing it.
    const line = formatDeployAlert(state({ head: null }));
    expect(line).toContain("cannot tell which commit");
    expect(formatDeployAlert(state({ originMain: null }))).toContain("cannot tell which commit");
  });

  it("still reports when the branch name is unavailable", () => {
    const line = formatDeployAlert(
      state({ head: "c".repeat(40), originMain: "d".repeat(40), branch: null })
    );
    expect(line).toContain("branch unknown");
  });
});

describe("deployKey", () => {
  it("is one key per (running commit, origin/main) pair, so it reports once", () => {
    const a: DeployState = { head: "aa", originMain: "bb", branch: "x", lastFetchMs: NOW };
    const b: DeployState = { head: "aa", originMain: "bb", branch: "y", lastFetchMs: NOW };
    expect(deployKey(a)).toBe(deployKey(b));
    expect(deployKey(a).startsWith(DEPLOY_KEY_PREFIX)).toBe(true);
  });

  it("changes when either side moves, so a new stale state is new news", () => {
    const base: DeployState = { head: "aa", originMain: "bb", branch: "x", lastFetchMs: NOW };
    expect(deployKey({ ...base, head: "cc" })).not.toBe(deployKey(base));
    expect(deployKey({ ...base, originMain: "cc" })).not.toBe(deployKey(base));
  });

  it("cannot collide with a park or a deferred key", () => {
    const key = deployKey({ head: "aa", originMain: "bb", branch: null, lastFetchMs: NOW });
    expect(key.startsWith("deferred:")).toBe(false);
    expect(key).toContain(":");
  });
});

/**
 * The sweep swallows its own `git pull` failure (`|| true`), so a host that
 * cannot reach GitHub leaves `origin/main` where it was, `HEAD` matching it,
 * and `formatDeployAlert` silent. These cover the line that reads the age of
 * the last successful fetch instead (LAC-7050 nit 3).
 */
describe("formatFetchAlert", () => {
  const hoursAgo = (h: number) => NOW - h * 3_600_000;
  const state = (lastFetchMs: number | null): DeployState => ({
    // Deliberately a clean match: the deploy check says nothing about this
    // state, which is the whole false negative being closed.
    head: "a".repeat(40),
    originMain: "a".repeat(40),
    branch: "main",
    lastFetchMs,
  });

  it("says nothing when the fetch is fresh, with HEAD and origin/main matching", () => {
    expect(formatFetchAlert(state(hoursAgo(1)), NOW)).toBeNull();
    expect(formatDeployAlert(state(hoursAgo(1)))).toBeNull();
  });

  it("brackets the threshold at 36h: quiet at 35, loud at 37", () => {
    // Absolute hours on purpose. Written as `FETCH_STALE_HOURS - 1` these
    // would pass under every value of the constant and pin nothing.
    // Mutants: 48 reddens the second assert, 24 the first.
    expect(FETCH_STALE_HOURS).toBe(36);
    expect(formatFetchAlert(state(hoursAgo(35)), NOW)).toBeNull();
    const line = formatFetchAlert(state(hoursAgo(37)), NOW);
    expect(line).toContain("could not refresh origin/main");
    expect(line).toContain("last fetch 37h ago");
  });

  it("is quiet for a single missed daily pull and loud for two", () => {
    // The reason for 36h rather than 1h: one failed pull leaves ~24h of age and
    // the next run's pull clears it; two consecutive failures is ~48h.
    // Mutants: FETCH_STALE_HOURS of 1 reddens the first assert, 48 the second.
    expect(formatFetchAlert(state(hoursAgo(24)), NOW)).toBeNull();
    expect(formatFetchAlert(state(hoursAgo(48)), NOW)).toContain("last fetch 48h ago");
  });

  it("reports a checkout that has never fetched rather than reading it as fresh", () => {
    // Mutant: dropping the null guard returns null here, which is the silent
    // direction this whole line exists to remove.
    const line = formatFetchAlert(state(null), NOW);
    expect(line).toContain("could not refresh origin/main");
    expect(line).toContain("no successful fetch on record");
  });

  it("names hours, not days, so 36h and 71h do not both read as 1d", () => {
    // Mutant: swapping in `formatAge` reddens both asserts.
    expect(formatFetchAlert(state(hoursAgo(36)), NOW)).toContain("36h ago");
    expect(formatFetchAlert(state(hoursAgo(71)), NOW)).toContain("71h ago");
  });
});

describe("fetchKey", () => {
  it("is one key per last successful fetch, so a standing failure says it once", () => {
    const base: DeployState = {
      head: "aa",
      originMain: "aa",
      branch: "main",
      lastFetchMs: NOW - 40 * 3_600_000,
    };
    expect(fetchKey(base)).toBe(fetchKey({ ...base, branch: "other" }));
    expect(fetchKey(base).startsWith(FETCH_KEY_PREFIX)).toBe(true);
  });

  it("changes when a pull lands, so the next staleness is new news", () => {
    const base: DeployState = { head: "aa", originMain: "aa", branch: "main", lastFetchMs: 1_000 };
    expect(fetchKey({ ...base, lastFetchMs: 2_000 })).not.toBe(fetchKey(base));
    expect(fetchKey({ ...base, lastFetchMs: null })).not.toBe(fetchKey(base));
  });

  it("cannot collide with a deploy, park or deferred key", () => {
    const key = fetchKey({ head: "aa", originMain: "bb", branch: null, lastFetchMs: 1_000 });
    expect(key.startsWith(DEPLOY_KEY_PREFIX)).toBe(false);
    expect(key.startsWith("deferred:")).toBe(false);
  });
});

/**
 * The branch this whole feature exists for: the copy that is executing lives in
 * a different repo from the process cwd. That is unreachable while `repo` is
 * computed inside the function, which is why it is a parameter (LAC-7050 nit 1).
 */
describe("readDeployState", () => {
  const git = (cwd: string, ...args: string[]) =>
    spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });

  let repo: string;
  let elsewhere: string;
  let originalCwd: string;
  /** Four more repos, so the FETCH_HEAD cases cannot depend on test order. */
  let neverFetched: string;
  let staleFetch: string;
  let worktreeHost: string;
  /** The production shape: a worktree with its own FETCH_HEAD, plus a fresher shared one. */
  let precedenceHost: string;
  let precedenceWorktree: string;

  beforeAll(() => {
    originalCwd = process.cwd();
    repo = mkdtempSync(path.join(tmpdir(), "sw-repo-"));
    elsewhere = mkdtempSync(path.join(tmpdir(), "sw-cwd-"));
    git(repo, "init", "-q", "-b", "main");
    git(repo, "config", "user.email", "me@lacymorrow.com");
    git(repo, "config", "user.name", "Lacy Morrow");
    writeFileSync(path.join(repo, "f"), "one\n");
    git(repo, "add", "f");
    git(repo, "commit", "-qm", "one");
    // A local origin/main, so the comparison has both sides without a network.
    git(repo, "update-ref", "refs/remotes/origin/main", "HEAD");

    neverFetched = mkdtempSync(path.join(tmpdir(), "sw-nofetch-"));
    staleFetch = mkdtempSync(path.join(tmpdir(), "sw-stale-"));
    worktreeHost = mkdtempSync(path.join(tmpdir(), "sw-wthost-"));
    precedenceHost = mkdtempSync(path.join(tmpdir(), "sw-prec-"));
    for (const dir of [neverFetched, staleFetch, worktreeHost, precedenceHost]) {
      git(dir, "init", "-q", "-b", "main");
      git(dir, "config", "user.email", "me@lacymorrow.com");
      git(dir, "config", "user.name", "Lacy Morrow");
      writeFileSync(path.join(dir, "f"), "one\n");
      git(dir, "add", "f");
      git(dir, "commit", "-qm", "one");
      git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
    }
    // `git clone` and `git init` write no FETCH_HEAD; only a fetch does. So
    // `neverFetched` is left exactly as git made it.
    for (const dir of [staleFetch, worktreeHost]) {
      const fetchHead = path.join(dir, ".git", "FETCH_HEAD");
      writeFileSync(fetchHead, "");
      utimesSync(fetchHead, STALE_FETCH_AT / 1000, STALE_FETCH_AT / 1000);
    }

    // `~/repo/buildandserve-ops` in miniature: a worktree whose own pull has
    // gone stale (40h) while a sibling session keeps the shared FETCH_HEAD
    // fresh (1h). Both files exist, which is the production shape.
    precedenceWorktree = `${precedenceHost}-wt`;
    git(precedenceHost, "worktree", "add", "-q", "-b", "side", precedenceWorktree);
    const sharedHead = path.join(precedenceHost, ".git", "FETCH_HEAD");
    writeFileSync(sharedHead, "");
    utimesSync(sharedHead, (NOW - 3_600_000) / 1000, (NOW - 3_600_000) / 1000);
    const ownHead = spawnSync(
      "git",
      ["-C", precedenceWorktree, "rev-parse", "--git-path", "FETCH_HEAD"],
      { encoding: "utf8" }
    ).stdout.trim();
    writeFileSync(ownHead, "");
    utimesSync(ownHead, STALE_FETCH_AT / 1000, STALE_FETCH_AT / 1000);
    // Five temp repos and two `git worktree add` calls; the 10s default is not
    // enough on a cold filesystem cache.
  }, 60_000);

  afterAll(() => {
    process.chdir(originalCwd);
    rmSync(repo, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
    rmSync(neverFetched, { recursive: true, force: true });
    rmSync(staleFetch, { recursive: true, force: true });
    rmSync(`${worktreeHost}-wt`, { recursive: true, force: true });
    rmSync(worktreeHost, { recursive: true, force: true });
    rmSync(precedenceWorktree, { recursive: true, force: true });
    rmSync(precedenceHost, { recursive: true, force: true });
  });

  it("reads the repo it is given, not the cwd it is called from", async () => {
    process.chdir(elsewhere);
    const state = await readDeployState(repo);
    const head = git(repo, "rev-parse", "HEAD").stdout.trim();
    expect(state.head).toBe(head);
    expect(state.originMain).toBe(head);
    expect(state.branch).toBe("main");
    // The point of the test: cwd is not a repo at all, so a cwd-based read
    // would have produced nulls here.
    expect(formatDeployAlert(state)).toBeNull();
  });

  it("reports a real divergence in the given repo while cwd is elsewhere", async () => {
    process.chdir(elsewhere);
    writeFileSync(path.join(repo, "f"), "two\n");
    git(repo, "add", "f");
    git(repo, "commit", "-qm", "two");
    const state = await readDeployState(repo);
    expect(state.head).not.toBe(state.originMain);
    const alert = formatDeployAlert(state);
    expect(alert).not.toBeNull();
    expect(alert).toContain(state.head?.slice(0, 8));
  });

  /**
   * A contract test, not a discriminating one: it returns nulls rather than
   * throwing, and nulls read as "cannot tell". Recorded honestly because it
   * does NOT redden under either mutant run for the two tests above (ignoring
   * the `repo` parameter, or going back to `Bun.spawn`) -- both of those also
   * produce nulls here, so this assert passes for the wrong reason under them.
   * Its value is guarding against a future rewrite that throws instead.
   */
  it("fails loud rather than silent when the path is not a repo", async () => {
    process.chdir(repo);
    const state = await readDeployState(elsewhere);
    expect(state.head).toBeNull();
    expect(state.originMain).toBeNull();
    // Null must never read as "the copy is current".
    expect(formatDeployAlert(state)).toContain("cannot tell which commit it is running");
  });

  /**
   * The path resolution is the part a pure-formatter test cannot reach:
   * `--git-path` answers relative to the repo in a plain clone and absolute
   * inside a worktree, and getting that wrong reads as "never fetched" on a
   * perfectly healthy checkout.
   */
  it("reads the age of FETCH_HEAD in the repo it is given", async () => {
    process.chdir(elsewhere);
    const state = await readDeployState(staleFetch);
    expect(state.lastFetchMs).not.toBeNull();
    expect(Math.abs(Number(state.lastFetchMs) - STALE_FETCH_AT)).toBeLessThan(2_000);
    // HEAD matches origin/main here, so the deploy line is silent and this is
    // the only thing that says the copy may be blind. That is the whole nit.
    expect(formatDeployAlert(state)).toBeNull();
    expect(formatFetchAlert(state, NOW)).toContain("last fetch 40h ago");
  });

  /**
   * The common-dir fallback, which nothing else reaches: in a worktree
   * `--git-path FETCH_HEAD` answers with a per-worktree path that usually does
   * not exist, while the fetch that actually happened wrote to the common dir.
   * Without the fallback a healthy by-hand run from a worktree reads as "never
   * fetched". Mutant: dropping the second candidate reddens this and nothing
   * else in the file.
   */
  it("finds a fetch recorded in the common dir when run from a worktree", async () => {
    process.chdir(elsewhere);
    const wt = path.join(worktreeHost, "..", `${path.basename(worktreeHost)}-wt`);
    git(worktreeHost, "worktree", "add", "-q", "-b", "side", wt);
    // The per-worktree FETCH_HEAD does not exist; the common dir's does.
    expect(
      spawnSync("git", ["-C", wt, "rev-parse", "--git-path", "FETCH_HEAD"], {
        encoding: "utf8",
      }).stdout.trim()
    ).toContain("worktrees");
    const state = await readDeployState(wt);
    expect(state.lastFetchMs).not.toBeNull();
    expect(Math.abs(Number(state.lastFetchMs) - STALE_FETCH_AT)).toBeLessThan(2_000);
    expect(formatFetchAlert(state, NOW)).toContain("last fetch 40h ago");
  });

  /**
   * The production shape, and the reason the order is not "newest wins":
   * `~/repo/buildandserve-ops` is a worktree of `~/repo/buildandserve`, so a
   * sibling session's fetch keeps the shared FETCH_HEAD fresh while this
   * checkout's own pull is failing. Mutant: taking the newest of the two
   * candidates reddens this and nothing else.
   */
  it("prefers this checkout's own FETCH_HEAD over a fresher shared one", async () => {
    process.chdir(elsewhere);
    const state = await readDeployState(precedenceWorktree);
    expect(Math.abs(Number(state.lastFetchMs) - STALE_FETCH_AT)).toBeLessThan(2_000);
    expect(formatFetchAlert(state, NOW)).toContain("last fetch 40h ago");
  });

  it("reports a real repo that has never fetched as no fetch on record", async () => {
    process.chdir(elsewhere);
    const state = await readDeployState(neverFetched);
    // Not the "not a repo" case: git answers fine here.
    expect(state.head).not.toBeNull();
    expect(state.lastFetchMs).toBeNull();
    expect(formatFetchAlert(state, NOW)).toContain("no successful fetch on record");
  });
});

/**
 * Drift guard for the two lists the hold lateral pins (LAC-7022 review).
 *
 * The lateral needs `EXECUTION_RECONCILIATION_CAUSES` and
 * `CONVERSATION_ADAPTER_TYPES` as SQL literals, and this script is standalone,
 * so both are copied into it. A copy fails in the quiet direction: when the
 * server adds an eighteenth cause, the column stops reporting that kind of hold
 * and says nothing. These tests are the only thing that makes the copy
 * defensible, so they must fail loudly rather than pass vacuously -- which is
 * why a missing install SKIPS with a message instead of asserting nothing.
 *
 * The lists are read out of the installed JavaScript as text rather than
 * imported. Importing would need the `~/.npm/_npx/<hash>/` path inside a module
 * graph vitest controls, and the hash changes on every server upgrade; reading
 * the file is the same information with none of that coupling.
 */
/** One wording for both skip paths, so neither can be the quiet one. */
const unverified = (why: string): string =>
  `SKIPPED, PINNED LISTS UNVERIFIED IN THIS RUN: ${why}. The ` +
  "EXECUTION_RECONCILIATION_CAUSES and CONVERSATION_ADAPTER_TYPES copies in " +
  "scripts/paperclip-stranded-watch.ts were not compared against the server. Expected " +
  "on any machine that does not run the control plane; a failure anywhere else.";

describe("pinned server constants", () => {
  const home = process.env.HOME ?? "";

  /** The install the RUNNING server is executing, when it can be identified. */
  const activeInstall = (): string | null => {
    try {
      const info = JSON.parse(
        readFileSync(path.join(home, ".paperclip/instances/default/runtime-info.json"), "utf8")
      ) as { pid?: number };
      if (typeof info.pid !== "number") return null;
      const out = spawnSync("ps", ["-o", "command=", "-p", String(info.pid)], {
        encoding: "utf8",
      }).stdout;
      const match = /(.*_npx\/[0-9a-f]+)\/node_modules\//.exec(out ?? "");
      return match ? match[1] : null;
    } catch {
      return null;
    }
  };

  /** Every cached install, newest first, so a stale npx cache cannot win. */
  const candidates = (): string[] => {
    const root = path.join(home, ".npm/_npx");
    let entries: string[] = [];
    try {
      entries = readdirSync(root);
    } catch {
      return [];
    }
    return entries
      .map((entry) => path.join(root, entry))
      .filter((dir) => existsSync(path.join(dir, "node_modules/@paperclipai")))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  };

  const resolveInstall = (): string | null => {
    const active = activeInstall();
    if (active && existsSync(path.join(active, "node_modules/@paperclipai"))) return active;
    return candidates()[0] ?? null;
  };

  /** Pulls one `export const NAME = [ ... ]` string array out of dist JS. */
  const readList = (file: string, name: string): string[] => {
    const text = readFileSync(file, "utf8");
    const start = text.indexOf(`export const ${name} = [`);
    expect(start, `${name} not found in ${file}`).toBeGreaterThanOrEqual(0);
    const end = text.indexOf("];", start);
    expect(end, `${name} literal is unterminated in ${file}`).toBeGreaterThan(start);
    return [...text.slice(start, end).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  };

  it("every pinned value is a bare identifier, so SQL interpolation is safe", () => {
    // The lateral interpolates these rather than binding them. That is only
    // sound while nothing can carry a quote or a semicolon.
    for (const value of [...EXECUTION_RECONCILIATION_CAUSES, ...CONVERSATION_ADAPTER_TYPES]) {
      expect(value, `${value} is not a bare identifier`).toMatch(/^[a-z_]+$/);
    }
  });

  it("matches the installed server's lists, or says why it could not look", (ctx) => {
    const install = resolveInstall();
    if (install === null) {
      // Both channels on purpose. vitest swallows `console.warn` from a task
      // that ends up skipped (measured: the message never reached the
      // reporter), and `ctx.skip(note)` only shows the note on some reporters,
      // so a direct stderr write is what makes this audible either way. A
      // silent skip would be the exact failure this file exists to prevent.
      process.stderr.write(`${unverified("no @paperclipai install under ~/.npm/_npx")}\n`);
      ctx.skip(unverified("no @paperclipai install under ~/.npm/_npx"));
      return;
    }
    const shared = path.join(
      install,
      "node_modules/@paperclipai/shared/dist/types/execution-projection.js"
    );
    const server = path.join(
      install,
      "node_modules/@paperclipai/server/dist/services/conversation-continuation.js"
    );
    if (!existsSync(shared) || !existsSync(server)) {
      const why = `${install} has no execution-projection.js / conversation-continuation.js`;
      process.stderr.write(`${unverified(why)}\n`);
      ctx.skip(unverified(why));
      return;
    }
    // Order matters as well as membership: the lateral emits them in order and
    // a reordering is a sign the server list was rewritten, not appended to.
    expect(readList(shared, "EXECUTION_RECONCILIATION_CAUSES")).toEqual([
      ...EXECUTION_RECONCILIATION_CAUSES,
    ]);
    expect(readList(server, "CONVERSATION_ADAPTER_TYPES")).toEqual([...CONVERSATION_ADAPTER_TYPES]);
  });
});

describe("hold lateral is shared, not copied (LAC-7846)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "../../../scripts/paperclip-stranded-watch.ts"),
    "utf8"
  );

  // The park lane and the deferred lane must answer "is there a hold?" with
  // the same SQL. They did not before LAC-7846 -- only the deferred lane had
  // the column -- and the obvious way to add it is to paste the lateral a
  // second time. Two copies of a 17-cause predicate replicated from the
  // server drift silently, and the column's whole value is that it says
  // exactly what the server says. One definition, two interpolations.
  it("defines the lateral once and interpolates it in both queries", () => {
    expect(source.match(/LEFT JOIN LATERAL \(/g) ?? []).toHaveLength(1);
    expect(source.match(/\$\{HOLD_LATERAL\}/g) ?? []).toHaveLength(2);
  });

  it("selects the hold column in both queries", () => {
    expect(source).toContain("coalesce(h.cause, '') AS hold_cause");
    expect(source).toContain("coalesce(max(h.cause), '') AS hold_cause");
  });

  // The lateral is the server's `executionBlockerPredicate()`. Both arms it
  // turns on have to survive any edit: the status half admits an action still
  // open, and the evidence half admits a RESOLVED row whose automatic
  // recovery refused to replay. That second arm is the one that matters here
  // -- on all 37 held issues measured 2026-11-12 the action was `resolved`
  // and `activeRecoveryAction` read null, so a status-only lateral would have
  // reported zero holds while 37 issues sat unreachable.
  it("keeps both arms of the server predicate", () => {
    expect(source).toContain("ra.status IN ('active', 'escalated')");
    expect(source).toContain("ra.evidence -> 'automaticRecovery' ->> 'replay' = 'blocked'");
  });
});

describe("exit-code contract (LAC-6580)", () => {
  const script = path.resolve(__dirname, "../../../scripts/paperclip-stranded-watch.ts");
  const run = ({
    RUN_ARGS,
    STATE_PATH,
    ...env
  }: Record<string, string> & { RUN_ARGS?: string; STATE_PATH?: string }) => {
    const clean = { ...process.env, ...env };
    if (!("PAPERCLIP_DB_URL" in env)) delete clean.PAPERCLIP_DB_URL;
    // Unconfigured on purpose: a notify attempt must fail locally, never post.
    delete clean.STRANDED_WATCH_SLACK_TOKEN;
    delete clean.STRANDED_WATCH_SLACK_CHANNEL;
    const statePath =
      STATE_PATH ?? path.join(mkdtempSync(path.join(tmpdir(), "stranded-exit-")), "state.json");
    return spawnSync("bun", [script, "--state", statePath, ...(RUN_ARGS ? [RUN_ARGS] : [])], {
      env: clean,
      encoding: "utf8",
      timeout: 30_000,
    });
  };

  it("keeps quiet, parked and could-not-look as three different codes", () => {
    expect(new Set([EXIT_QUIET, EXIT_PARKED, EXIT_COULD_NOT_LOOK]).size).toBe(3);
    expect(EXIT_COULD_NOT_LOOK).toBe(2);
  });

  it("exits 2, not 0, when PAPERCLIP_DB_URL is missing", () => {
    const result = run({});
    expect(result.status).toBe(EXIT_COULD_NOT_LOOK);
    expect(result.stderr).toContain("PAPERCLIP_DB_URL must be set");
  });

  it("exits 2, not 0 or 1, when the database is unreachable", () => {
    const result = run({ PAPERCLIP_DB_URL: "postgres://x:x@127.0.0.1:1/x" });
    expect(result.status).toBe(EXIT_COULD_NOT_LOOK);
    expect(result.stderr).toContain("could not read the Paperclip database");
  });

  // The exit code alone was never the defect: unfixed, a blind run already
  // exited 2 and said nothing a person would see. These two assert the half
  // that actually failed -- that 2 is spoken out loud, and that a delivery
  // failure cannot swallow it (LAC-6580).
  it("tries to tell someone when it could not look", () => {
    const result = run({ RUN_ARGS: "--notify" });
    expect(result.status).toBe(EXIT_COULD_NOT_LOOK);
    // Slack is unconfigured here, so no network call happens: the rejection
    // itself is the proof the notify path was entered at all.
    expect(result.stderr).toContain("must both be set to notify");
  });

  it("does not try to notify without --notify", () => {
    const result = run({});
    expect(result.status).toBe(EXIT_COULD_NOT_LOOK);
    expect(result.stderr).not.toContain("must both be set to notify");
  });

  it("writes no blind-day stamp when the DM was not delivered, so it retries", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "stranded-blind-"));
    const statePath = path.join(dir, "state.json");
    const result = run({ RUN_ARGS: "--notify", STATE_PATH: statePath });
    expect(result.status).toBe(EXIT_COULD_NOT_LOOK);
    expect(existsSync(`${statePath}.blind-day`)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("formatBlindAlert", () => {
  it("says the watch is blind, not that the board is quiet", () => {
    const text = formatBlindAlert("PAPERCLIP_DB_URL must be set");
    expect(text).toContain("could not look");
    expect(text).toContain("PAPERCLIP_DB_URL must be set");
  });
});
