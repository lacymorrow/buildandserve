import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
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
  formatAge,
  formatAlert,
  formatDeferredAlert,
  formatDeployAlert,
  GRACE_MINUTES,
  MAX_NAMED,
  nextDeferredState,
  nextState,
  readDeployState,
  stranded,
  unreported,
  unreportedDeferred,
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
    const a: DeployState = { head: "aa", originMain: "bb", branch: "x" };
    const b: DeployState = { head: "aa", originMain: "bb", branch: "y" };
    expect(deployKey(a)).toBe(deployKey(b));
    expect(deployKey(a).startsWith(DEPLOY_KEY_PREFIX)).toBe(true);
  });

  it("changes when either side moves, so a new stale state is new news", () => {
    const base: DeployState = { head: "aa", originMain: "bb", branch: "x" };
    expect(deployKey({ ...base, head: "cc" })).not.toBe(deployKey(base));
    expect(deployKey({ ...base, originMain: "cc" })).not.toBe(deployKey(base));
  });

  it("cannot collide with a park or a deferred key", () => {
    const key = deployKey({ head: "aa", originMain: "bb", branch: null });
    expect(key.startsWith("deferred:")).toBe(false);
    expect(key).toContain(":");
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
  });

  afterAll(() => {
    process.chdir(originalCwd);
    rmSync(repo, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
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
    expect(alert).toContain(state.head!.slice(0, 8));
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
