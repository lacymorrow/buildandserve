#!/usr/bin/env bun
/**
 * Tells Lacy when fleet work has gone quiet (LAC-4568).
 *
 * Paperclip parks an issue in `blocked` when a run dies before the agent got
 * control. The park is deliberate: a `stranded_assigned_issue` recovery action
 * is filed with `ownerType: "board"` and a next action that reads "Board
 * operator: inspect the evidence, then retry the original owner." But `blocked`
 * wakes nobody, the recovery action is a row in a table, and no message is sent.
 * So the platform assigns Lacy a job and never tells him it did.
 *
 * On 2026-10-16 the laptop slept at 1% battery. The 08:00Z Doug store watch
 * slot (LAC-4564) died mid-setup, got parked that way at 09:29Z, and was never
 * retried. Doug's stores went unwatched for 9.5 hours. When this check was
 * written, 101 issues were sitting in that state and 27 more had no wake path
 * at all, the oldest from July.
 *
 * Two properties make it worth having, both borrowed from the sibling check in
 * `doug-store-watch-freshness.ts`:
 *
 * 1. **It does not run inside Paperclip.** Paperclip is the thing that fails,
 *    and the morning this was written it was down for two hours. launchd runs
 *    this, and it reads Postgres directly, so a dead control plane cannot take
 *    the alarm down with it.
 * 2. **It never writes to the board.** Read-only, by design. Unparking 100
 *    issues at once would stampede the fleet, and the platform re-parks some
 *    classes seconds after a write. Surfacing is the half that is missing.
 *
 * Usage:
 *   bun scripts/paperclip-stranded-watch.ts [--notify] [--state <path>]
 *
 * Exit codes: 0 = nothing went quiet, 1 = something did, 2 = could not look.
 *
 * Silence means healthy, same contract as the watch and the freshness check.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

/**
 * A park younger than this is still the platform's own business: revalidation
 * clears a transient one within seconds, and an agent mid-PATCH holds the state
 * for a moment while relations land. Half an hour is far past either, and still
 * well inside the 4h cadence of the slowest thing being watched.
 */
export const GRACE_MINUTES = 30;

/** Named in the DM. Past this the list stops being readable and becomes a wall. */
export const MAX_NAMED = 5;

/**
 * Split off on 2026-09-24; the real company runs on another machine. Its 25
 * blocked issues are a frozen copy, so alerting on them is pure noise.
 */
const GHOST_COMPANY_ID = "6002a0d1-a96a-4495-ae4f-dd26400d9602";

const DEFAULT_STATE_PATH = path.join(
  process.env.HOME ?? ".",
  ".paperclip",
  "stranded-watch-state.json"
);

/** One row of the query: an issue in `blocked` with no unresolved blocker. */
export interface BlockedIssue {
  identifier: string;
  title: string;
  assignee: string;
  strandedSinceMs: number;
  /** `cause` of the active recovery action, or "" when there is none. */
  recoveryCause: string;
  /** True when the issue declares who it is waiting on and what for. */
  hasDescriptor: boolean;
}

export interface Verdict {
  /** Parked under a recovery action whose owner was never told. */
  escalated: BlockedIssue[];
  /** No recovery action, no declared wait: nothing will ever wake it. */
  orphaned: BlockedIssue[];
  /** Deliberate waits. Counted, never alerted on. */
  declared: BlockedIssue[];
  /** Parked too recently to judge. */
  young: number;
}

/** Stable while one park lasts; different the next time the same issue parks. */
export function alertKey(issue: BlockedIssue): string {
  return `${issue.identifier}@${new Date(issue.strandedSinceMs).toISOString()}`;
}

/**
 * Sort the blocked issues into the three things they can mean.
 *
 * An issue carrying an `unblockDescriptor` is waiting on a named owner for a
 * named thing. That is a person choosing to park work, which is the system
 * working. Alerting on it would bury the 99 cases where nobody chose anything.
 */
export function classify(
  issues: BlockedIssue[],
  nowMs: number,
  graceMinutes: number = GRACE_MINUTES
): Verdict {
  const verdict: Verdict = { escalated: [], orphaned: [], declared: [], young: 0 };
  const seen = new Set<string>();
  const cutoff = nowMs - graceMinutes * 60_000;

  for (const issue of issues) {
    // One active recovery action per issue is the platform's invariant, but a
    // join is a join: a duplicate row must not become a duplicate alert.
    if (seen.has(issue.identifier)) continue;
    seen.add(issue.identifier);

    if (issue.strandedSinceMs > cutoff) {
      verdict.young += 1;
      continue;
    }
    if (issue.recoveryCause) verdict.escalated.push(issue);
    else if (issue.hasDescriptor) verdict.declared.push(issue);
    else verdict.orphaned.push(issue);
  }
  return verdict;
}

/** Everything that needs an owner it does not have, newest park first. */
export function stranded(verdict: Verdict): BlockedIssue[] {
  return [...verdict.escalated, ...verdict.orphaned].sort(
    (a, b) => b.strandedSinceMs - a.strandedSinceMs
  );
}

/** Days, because "parked 71 days" lands differently than a date in July. */
export function formatAge(sinceMs: number, nowMs: number): string {
  const days = Math.floor((nowMs - sinceMs) / 86_400_000);
  if (days >= 1) return `${days}d`;
  const hours = (nowMs - sinceMs) / 3_600_000;
  return `${Number(hours.toFixed(1))}h`;
}

function describe(issue: BlockedIssue, nowMs: number): string {
  const why = issue.recoveryCause || "no wake path";
  return `${issue.identifier} (${issue.assignee || "unassigned"}, ${formatAge(issue.strandedSinceMs, nowMs)}, ${why}): ${issue.title}`;
}

/**
 * The first run is a different message from every run after it.
 *
 * Steady state, the news is "this one just went quiet." On the first run the
 * news is a backlog that has been accumulating for months, and naming 128 of
 * them is not a message anyone reads. So the baseline gets counted, not listed,
 * and says plainly that the listing starts now.
 */
export function formatAlert(
  verdict: Verdict,
  fresh: BlockedIssue[],
  nowMs: number,
  isBaseline: boolean
): string {
  const all = stranded(verdict);
  if (isBaseline) {
    return (
      `Fleet work is parked with nobody told: ${all.length} issues ` +
      `(${verdict.escalated.length} waiting on a board decision that was never sent, ` +
      `${verdict.orphaned.length} with no wake path at all). ` +
      "Recorded as the baseline. From here you get one line per new one."
    );
  }

  const head =
    fresh.length === 1
      ? "1 issue just went quiet with nobody told:"
      : `${fresh.length} issues just went quiet with nobody told:`;
  const named = fresh.slice(0, MAX_NAMED).map((issue) => describe(issue, nowMs));
  const rest = fresh.length > MAX_NAMED ? [`+${fresh.length - MAX_NAMED} more`] : [];
  return [head, ...named, ...rest, `Parked in total: ${all.length}.`].join("\n");
}

/** Only ever the parks this state file has not already reported. */
export function unreported(current: BlockedIssue[], seenKeys: string[]): BlockedIssue[] {
  const seen = new Set(seenKeys);
  return current.filter((issue) => !seen.has(alertKey(issue)));
}

/**
 * Keys still parked, so the file stays the size of the problem. A key dropped
 * because its issue recovered cannot cause a repeat alert: the next park of
 * that issue carries a later timestamp and therefore a different key.
 */
export function nextState(current: BlockedIssue[]): string[] {
  return current.map(alertKey).sort();
}

const QUERY = `
  SELECT i.identifier,
         i.title,
         coalesce(a.name, '') AS assignee,
         (extract(epoch FROM coalesce(i.blocked_transition_at, i.updated_at)) * 1000)::bigint AS stranded_since_ms,
         coalesce(ra.cause, '') AS recovery_cause,
         (i.unblock_descriptor IS NOT NULL) AS has_descriptor
    FROM issues i
    LEFT JOIN agents a ON a.id = i.assignee_agent_id
    LEFT JOIN issue_recovery_actions ra
           ON ra.source_issue_id = i.id AND ra.status = 'active'
   WHERE i.status = 'blocked'
     AND i.company_id <> $1
     AND NOT EXISTS (
           SELECT 1
             FROM issue_relations ir
             JOIN issues b ON b.id = ir.issue_id
            WHERE ir.related_issue_id = i.id
              AND ir.type = 'blocks'
              AND b.status NOT IN ('done', 'cancelled')
         )
`;

/**
 * Read the board straight from Postgres. The URL is required rather than
 * defaulted so this file holds no credential, and so a typo fails loudly
 * instead of quietly watching the wrong database.
 */
async function readBlockedIssues(url: string): Promise<BlockedIssue[]> {
  // Timeouts, because a wedged database must not wedge the thing watching for
  // wedges. launchd would otherwise keep one hung process and skip every cycle.
  const sql = postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 5 });
  try {
    const rows = (await sql.unsafe(QUERY, [GHOST_COMPANY_ID])) as unknown as Record<
      string,
      unknown
    >[];
    return rows.map((row) => ({
      identifier: String(row.identifier),
      title: String(row.title),
      assignee: String(row.assignee ?? ""),
      strandedSinceMs: Number(row.stranded_since_ms),
      recoveryCause: String(row.recovery_cause ?? ""),
      hasDescriptor: row.has_descriptor === true,
    }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function readSeenKeys(statePath: string): Promise<string[] | null> {
  const raw = await readFile(statePath, "utf8").catch(() => null);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { keys?: unknown };
    return Array.isArray(parsed.keys) ? parsed.keys.map(String) : [];
  } catch {
    // A truncated state file must not mean "everything is new" and 128 DMs.
    // Treat it as a fresh baseline: one line, and the file is rewritten whole.
    return null;
  }
}

async function writeSeenKeys(statePath: string, keys: string[]): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify({ keys }, null, 2)}\n`);
}

/**
 * Slack-DM the line. Same contract as the freshness check: return the error
 * instead of throwing, because a failed DM must still leave the lines in the
 * launchd log and the exit code at 1. A monitor that goes quiet because its own
 * notifier broke is the bug this file exists to prevent.
 */
async function slackDm(text: string): Promise<string | null> {
  const token = process.env.STRANDED_WATCH_SLACK_TOKEN;
  const channel = process.env.STRANDED_WATCH_SLACK_CHANNEL;
  if (!token || !channel) {
    return "STRANDED_WATCH_SLACK_TOKEN and STRANDED_WATCH_SLACK_CHANNEL must both be set to notify";
  }
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel, text }),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    return body.ok ? null : `Slack rejected the message: ${body.error ?? res.status}`;
  } catch (error) {
    return `Slack post failed: ${(error as Error).message}`;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const statePath = (() => {
    const i = argv.indexOf("--state");
    return i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : DEFAULT_STATE_PATH;
  })();

  const url = process.env.PAPERCLIP_DB_URL;
  if (!url) {
    console.error("PAPERCLIP_DB_URL must be set (postgres://... for the Paperclip control plane)");
    process.exit(2);
  }

  let issues: BlockedIssue[];
  try {
    issues = await readBlockedIssues(url);
  } catch (error) {
    // Exit 2, not 1. "Could not look" must never be logged as "nothing is
    // parked", and it must not consume the one alert a real park would get.
    console.error(`could not read the Paperclip database: ${(error as Error).message}`);
    process.exit(2);
  }

  const now = Date.now();
  const verdict = classify(issues, now);
  const current = stranded(verdict);
  const seenKeys = await readSeenKeys(statePath);
  const isBaseline = seenKeys === null;

  if (current.length === 0) {
    // Healthy is silent. Record the empty set so a later park reads as new.
    if (!isBaseline) await writeSeenKeys(statePath, []);
    process.exit(0);
  }

  const fresh = isBaseline ? current : unreported(current, seenKeys);
  for (const issue of current) console.log(describe(issue, now));
  console.log(
    `parked: ${current.length} (escalated ${verdict.escalated.length}, orphaned ${verdict.orphaned.length}), ` +
      `declared waits ignored: ${verdict.declared.length}, too recent to judge: ${verdict.young}, new: ${fresh.length}`
  );

  if (argv.includes("--notify") && (isBaseline || fresh.length > 0)) {
    const failure = await slackDm(formatAlert(verdict, fresh, now, isBaseline));
    if (failure) console.error(failure);
    // Written only on a delivered DM, so a Slack outage retries next cycle
    // instead of silently consuming the alert this park was going to get.
    else await writeSeenKeys(statePath, nextState(current));
  }

  process.exit(1);
}

// Guarded so the pure helpers above can be imported by tests without touching
// Postgres, the filesystem or Slack.
if (import.meta.main) {
  main().catch((error) => {
    console.error("stranded watch failed:", error);
    process.exit(2);
  });
}
