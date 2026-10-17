#!/usr/bin/env bun
/**
 * Tells Lacy before the fleet goes dark (LAC-4574).
 *
 * Every agent run, every routine and every client-facing watch in this company
 * executes on one laptop. On 2026-10-16 that laptop slept at 1% battery:
 *
 *     Sleep  Entering Sleep state due to 'Low Power Sleep' ... (Charge:1%)
 *     Wake   Wake from Hibernate ... due to charger/UserActivity
 *
 * Two hours, zero `activity_log` rows, zero heartbeats, the 12:00Z Doug store
 * watch slot never evaluated, and nothing anywhere said so. The gap was found
 * afterwards, by reading `pmset -g log`.
 *
 * This is the warning that was missing. It is one line in Slack while there is
 * still time to plug in, and it borrows both properties that make the sibling
 * checks work:
 *
 * 1. **Nothing of it lives in Paperclip.** Paperclip is downstream of the
 *    battery, so a routine that watches the battery dies with it. launchd runs
 *    this, and it reads `pmset`, which is as close to the hardware as a script
 *    gets.
 * 2. **One alert per thing that happened.** Once below 20%, once below 10%, and
 *    then nothing until the Mac is back on AC. A monitor that repeats itself
 *    every five minutes for an hour is a monitor nobody reads.
 *
 * Usage:
 *   bun scripts/fleet-power-watch.ts [--notify] [--state <path>]
 *
 * Exit codes: 0 = power is fine, 1 = running low, 2 = could not read the power
 * state. Silence means healthy, same contract as the store watch, its freshness
 * check and the stranded-work watch.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * First warning. Far enough out that plugging in is a decision rather than a
 * scramble: ~20% of a laptop battery is most of an hour of ordinary work.
 */
export const WARN_PERCENT = 20;

/**
 * Second and last warning. Below this the estimate gets short and unreliable,
 * and macOS starts making its own decisions about sleeping.
 */
export const URGENT_PERCENT = 10;

/** Checked low to high so the most urgent unsent warning is the one that goes. */
const TIERS = [URGENT_PERCENT, WARN_PERCENT];

const DEFAULT_STATE_PATH = path.join(
  process.env.HOME ?? ".",
  ".paperclip",
  "power-watch-state.json"
);

export interface PowerState {
  percent: number;
  onAC: boolean;
  /** Minutes left by pmset's own estimate, or null when it does not have one. */
  minutesLeft: number | null;
  /** False on a machine with no battery, which has nothing to warn about. */
  hasBattery: boolean;
}

export interface Decision {
  alert: boolean;
  /** Thresholds already spent on this discharge. Empty whenever on AC. */
  nextAlerted: number[];
}

/**
 * Read `pmset -g batt` output.
 *
 * Returns null when the output is not recognisable, which is deliberately
 * different from "the power is fine": a pmset that stopped answering is a blind
 * watch, and a blind watch must say so rather than exit 0.
 */
export function parsePmset(output: string): PowerState | null {
  const source = /Now drawing from '([^']+)'/.exec(output);
  if (!source) return null;
  const onAC = source[1] !== "Battery Power";

  const battery = /(\d+)%;/.exec(output);
  // A desktop or server prints the source line and no battery line. Nothing to
  // watch, so it reports as permanently fine rather than as unreadable.
  if (!battery) return { percent: 100, onAC, minutesLeft: null, hasBattery: false };

  const estimate = /(\d+):(\d\d) remaining/.exec(output);
  const minutes = estimate ? Number(estimate[1]) * 60 + Number(estimate[2]) : 0;

  return {
    percent: Number(battery[1]),
    onAC,
    // pmset writes `0:00` and `(no estimate)` for the same thing: it has not
    // worked the number out yet. Reporting that as "0 min left" is the kind of
    // false alarm that gets a channel muted.
    minutesLeft: minutes > 0 ? minutes : null,
    hasBattery: true,
  };
}

/**
 * Whether to send, and what to remember afterwards.
 *
 * AC clears the memory, which is the entire dedupe rule: one discharge gets at
 * most two messages, and the next discharge starts fresh. Crossing both
 * thresholds between two checks (the Mac was asleep, or this was installed
 * mid-discharge) spends both and sends one message, not two.
 */
export function decide(state: PowerState, alerted: number[]): Decision {
  if (state.onAC || !state.hasBattery) return { alert: false, nextAlerted: [] };

  const crossed = TIERS.filter((tier) => state.percent < tier);
  const unspent = crossed.filter((tier) => !alerted.includes(tier));
  const nextAlerted = [...new Set([...alerted, ...crossed])].sort((a, b) => b - a);

  return { alert: unspent.length > 0, nextAlerted };
}

/** pmset's estimate in the units a person would say it in. */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * The whole message. Number first, because that is the decision; what stops,
 * because that is why it matters; the action last, because it is one word of
 * work. Naming the three things that die is the point. "Low battery" is
 * something the menu bar already says and nobody acts on.
 */
export function formatAlert(state: PowerState): string {
  const left = state.minutesLeft === null ? "" : `, about ${formatMinutes(state.minutesLeft)} left`;
  return (
    `Mac at ${state.percent}% on battery${left}. ` +
    "Below ~5% it sleeps and the whole fleet stops: no routines, no agent runs, " +
    "no store watch. Plug in."
  );
}

async function readPmset(): Promise<string> {
  // Absolute path: launchd hands a job a minimal PATH, and this must not fail
  // for a reason as boring as that. Timed out because a wedged pmset must not
  // leave a hung process that makes launchd skip every later cycle.
  const { stdout } = await run("/usr/bin/pmset", ["-g", "batt"], { timeout: 10_000 });
  return stdout;
}

async function readAlerted(statePath: string): Promise<number[]> {
  const raw = await readFile(statePath, "utf8").catch(() => null);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as { alerted?: unknown };
    return Array.isArray(parsed.alerted) ? parsed.alerted.map(Number).filter(Number.isFinite) : [];
  } catch {
    // A truncated state file reads as "nothing sent yet". The cost is one extra
    // DM in a discharge; the opposite default costs the warning entirely.
    return [];
  }
}

async function writeAlerted(statePath: string, alerted: number[]): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify({ alerted }, null, 2)}\n`);
}

/**
 * Slack-DM the line. Same contract as the sibling checks: return the error
 * rather than throw, because a failed DM must still leave the line in the
 * launchd log and the exit code at 1. A monitor that goes quiet because its own
 * notifier broke is the bug this file exists to prevent.
 */
async function slackDm(text: string): Promise<string | null> {
  const token = process.env.POWER_WATCH_SLACK_TOKEN;
  const channel = process.env.POWER_WATCH_SLACK_CHANNEL;
  if (!token || !channel) {
    return "POWER_WATCH_SLACK_TOKEN and POWER_WATCH_SLACK_CHANNEL must both be set to notify";
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
  const i = argv.indexOf("--state");
  const stateArg = i >= 0 ? argv[i + 1] : undefined;
  const statePath = stateArg ? path.resolve(stateArg) : DEFAULT_STATE_PATH;

  let output: string;
  try {
    output = await readPmset();
  } catch (error) {
    console.error(`could not run pmset: ${(error as Error).message}`);
    process.exit(2);
  }

  const state = parsePmset(output);
  if (state === null) {
    // Exit 2, not 0. "Could not look" and "the power is fine" are the two
    // readings this file exists to keep apart.
    console.error(`could not read the power state from pmset:\n${output.trim()}`);
    process.exit(2);
  }

  const alerted = await readAlerted(statePath);
  const decision = decide(state, alerted);

  // Healthy is silent. Comfortable battery, AC, or no battery: say nothing.
  if (!state.hasBattery || state.onAC || state.percent >= WARN_PERCENT) {
    // Back on AC clears the memory, so the next discharge gets its own two
    // warnings. This is the only rearm path there is.
    if (decision.nextAlerted.length === 0 && alerted.length > 0) {
      await writeAlerted(statePath, []);
    }
    process.exit(0);
  }

  // Still low but already warned: the log keeps following the discharge, Slack
  // does not.
  console.log(formatAlert(state));

  if (decision.alert && argv.includes("--notify")) {
    const failure = await slackDm(formatAlert(state));
    if (failure) console.error(failure);
    // Written only on a delivered DM, so a Slack outage retries in five minutes
    // instead of silently spending the one warning this discharge was owed.
    else await writeAlerted(statePath, decision.nextAlerted);
  }

  process.exit(1);
}

// Guarded so the pure helpers above can be imported by tests without touching
// pmset, the filesystem or Slack.
if (import.meta.main) {
  main().catch((error) => {
    console.error("power watch failed:", error);
    process.exit(2);
  });
}
