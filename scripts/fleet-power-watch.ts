#!/usr/bin/env bun
/**
 * Tells Lacy before the fleet goes dark (LAC-4574), on the channel that can
 * still wake him (LAC-6137).
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
 * The second warning also goes to ntfy at priority 5, an iOS Critical Alert
 * (LAC-6137). Slack alone was measured insufficient: on 2026-10-28 this watch
 * DM'd at 11:27 (17%) and 11:52 (8%), both delivered, neither acted on, the Mac
 * hibernated at 12:14, and the fleet lost 3h32m. The dark watch's Critical
 * Alert fired at 12:30, sixteen minutes after a cable would still have helped.
 * One buzz at 8% costs ten seconds; the same buzz at 12:30 costs three hours.
 *
 * Not the "louder battery warning" LAC-4874 rejected. That rejected repeating
 * an ignored Slack message, and predates LAC-5366 building a channel that
 * survives Do Not Disturb. The channel is the new fact.
 *
 * Usage:
 *   bun scripts/fleet-power-watch.ts [--notify] [--state <path>]
 *   bun scripts/fleet-power-watch.ts --self-test
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

export type Channel = "slack" | "ntfy";

/**
 * Which channels a tier is worth waking someone over.
 *
 * 20% is a heads-up: most of an hour of runway, where plugging in is a decision
 * rather than a scramble. Spending a Critical Alert on that is how the Critical
 * Alert gets switched off, the failure LAC-5366 exists to prevent.
 *
 * Below 10% the runway is fifteen to twenty-five minutes and missing it costs
 * hours, so the phone buzzes through Do Not Disturb. AC is the only rearm, so
 * that is at most one buzz per discharge, and a page that prevents the outage
 * replaces the dark watch's two.
 */
export function channelsFor(tier: number): Channel[] {
  return tier <= URGENT_PERCENT ? ["slack", "ntfy"] : ["slack"];
}

const DEFAULT_STATE_PATH = path.join(
  process.env.HOME ?? ".",
  ".paperclip",
  "power-watch-state.json"
);

/**
 * `%Y-%m-%dT%H:%M:%S%z`: local time with an explicit offset, the same spelling
 * `fleet-dark-watch.sh` writes, so the laptop-side and library-side logs of one
 * outage read side by side. Local rather than UTC because the other evidence
 * this log gets cross-referenced against (`pmset -g log`, `log show`,
 * `kern.boottime`) is all local to this Mac; the offset keeps it unambiguous
 * anyway.
 */
function isoLocal(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = -at.getTimezoneOffset();
  const abs = Math.abs(offset);
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}` +
    `${offset < 0 ? "-" : "+"}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`
  );
}

/**
 * Stamp every line this watch prints with the time it printed it.
 *
 * launchd appends stdout and stderr straight into `fleet-power-watch.log` and
 * adds no time of its own, so without this the file reads
 * `Mac at 2% on battery, about 3 min left.` four discharge cycles deep and
 * cannot say when any of them happened. Reconstructing the 2026-10-19 outage
 * needed `kern.boottime` cross-referenced against `usage-governor.log` for
 * exactly that reason, and this log is the file the next outage gets read from
 * (LAC-4874).
 *
 * A multi-line message gets a stamp per line: a `pmset` dump folded into the
 * log unstamped is the same unreadable file in a smaller way.
 */
export function stamp(message: string, at: Date = new Date()): string {
  const prefix = isoLocal(at);
  return message
    .split("\n")
    .map((line) => `${prefix} ${line}`)
    .join("\n");
}

const say = (message: string) => console.log(stamp(message));
const fail = (message: string) => console.error(stamp(message));

export interface PowerState {
  percent: number;
  onAC: boolean;
  /** Minutes left by pmset's own estimate, or null when it does not have one. */
  minutesLeft: number | null;
  /** False on a machine with no battery, which has nothing to warn about. */
  hasBattery: boolean;
}

export interface Decision {
  /**
   * The most urgent threshold crossed but not yet sent, or null for "say
   * nothing". A number rather than a boolean because the number picks the
   * channel: see `channelsFor`.
   */
  tier: number | null;
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
  if (state.onAC || !state.hasBattery) return { tier: null, nextAlerted: [] };

  const crossed = TIERS.filter((tier) => state.percent < tier);
  const unspent = crossed.filter((tier) => !alerted.includes(tier));
  const nextAlerted = [...new Set([...alerted, ...crossed])].sort((a, b) => b - a);

  // TIERS is ordered most-urgent-first, so the first unspent entry is the one
  // that decides the channel. A Mac first seen at 6% has both tiers unspent and
  // gets one message at the urgent weight, not two messages a second apart.
  return { tier: unspent[0] ?? null, nextAlerted };
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

// --- the channel that survives Do Not Disturb (LAC-6137) -------------------
//
// The same topic and the same priority `fleet-dark-watch.sh` pages on, by
// design: one subscription on Lacy's phone, one Critical Alert setting to keep
// switched on, and one thing to re-test. Two topics would be two chances for
// the pre-mortem to be the one he forgot to allow through Do Not Disturb.
//
// Sharing it does couple the two watches, and the dark watch's runbook used to
// say rotating the topic was local to it. That is no longer true and is
// corrected there: a rotation is now two hosts plus the phone.
const NTFY_BASE_URL = process.env.POWER_WATCH_NTFY_URL ?? "https://ntfy.sh";

/**
 * 5 is ntfy's maximum, and the only value its iOS app maps to a Critical Alert
 * and its Android app to a Do Not Disturb bypass. Anything lower makes this a
 * quieter Slack, which is the thing already measured as not working.
 */
const NTFY_PRIORITY = process.env.POWER_WATCH_NTFY_PRIORITY ?? "5";

/**
 * The topic IS the credential: a public ntfy topic is world-readable and
 * world-writable by whoever knows the name, and it travels in the URL. Hence a
 * 0600 file rather than this repo or the plist, and hence `redactTopic` on
 * everything printed about ntfy, because fetch puts the URL it failed on into
 * its own error text.
 */
const DEFAULT_NTFY_TOPIC_FILE = path.join(process.env.HOME ?? ".", ".paperclip", "ntfy-topic");

/**
 * A no-op while the topic is unset. An empty needle would otherwise splice the
 * placeholder between every character of the message.
 */
export function redactTopic(text: string, topic: string): string {
  return topic ? text.split(topic).join("<topic>") : text;
}

async function resolveNtfyTopic(): Promise<string> {
  const inline = process.env.POWER_WATCH_NTFY_TOPIC;
  if (inline) return inline.trim();
  const file = process.env.POWER_WATCH_NTFY_TOPIC_FILE ?? DEFAULT_NTFY_TOPIC_FILE;
  return (await readFile(file, "utf8").catch(() => "")).trim();
}

/**
 * The lock-screen glance, which is all Lacy reads before picking the phone up.
 *
 * The action, then the number. The dark watch's titles say `Fleet is dark` and
 * `Fleet is back`; this one must not be confusable with either, because those
 * two mean the hours are already lost and this one means they are not yet. The
 * number rides along so one glance answers "how long have I got".
 */
export function ntfyTitle(state: PowerState): string {
  return `Plug the Mac in (${state.percent}%)`;
}

/**
 * Push one line to ntfy at Critical Alert priority. Returns the error rather
 * than throwing, same contract as `slackDm`.
 *
 * A header value cannot carry a newline: either half of one ends the header
 * early and the rest becomes a forged header. Flattened for that reason, even
 * though today's titles are generated.
 */
async function ntfyPush(text: string, title: string): Promise<string | null> {
  const topic = await resolveNtfyTopic();
  if (!topic) {
    return `no ntfy topic: set POWER_WATCH_NTFY_TOPIC or put one in ${DEFAULT_NTFY_TOPIC_FILE}`;
  }
  const flatten = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ");
  try {
    const res = await fetch(`${NTFY_BASE_URL}/${topic}`, {
      method: "POST",
      headers: {
        Title: flatten(title),
        Priority: flatten(NTFY_PRIORITY),
        Tags: "electric_plug",
      },
      body: text,
    });
    if (res.ok) return null;
    return redactTopic(`ntfy rejected the message: http=${res.status}`, topic);
  } catch (error) {
    return redactTopic(`ntfy push failed: ${(error as Error).message}`, topic);
  }
}

export interface NotifyResult {
  /** True when at least one channel accepted it. See the comment below. */
  delivered: boolean;
  /** `slack=ok ntfy=failed`, for the one log line that shows a half-delivery. */
  summary: string;
  errors: string[];
}

/** Returns the failure, or null when the channel accepted the message. */
export type Sender = (text: string, title: string) => Promise<string | null>;

const SENDERS: Record<Channel, Sender> = { slack: slackDm, ntfy: ntfyPush };

/**
 * Every channel the tier is worth, one message, one event.
 *
 * Delivered means **at least one** channel accepted it, and that spends the
 * tier. The dark watch settled this first: requiring every channel re-pages the
 * phone every five minutes for the whole discharge whenever Slack is the broken
 * half, the exact muted-channel failure this file exists to avoid causing.
 * Requiring none records a warning as sent that nobody received.
 *
 * The cost is small and visible: Slack down plus ntfy up means that tier's
 * Slack copy never arrives. The phone buzzed, which is the half that matters,
 * and `SENT slack=failed ntfy=ok` in the log says so.
 *
 * `senders` is injected so this rule can be tested for what it is — the thing
 * standing between one buzz and a buzz every five minutes for three hours —
 * without a network or a real phone.
 */
export async function notify(
  text: string,
  title: string,
  channels: Channel[],
  senders: Record<Channel, Sender> = SENDERS
): Promise<NotifyResult> {
  const errors: string[] = [];
  const parts: string[] = [];
  for (const channel of channels) {
    const failure = await senders[channel](text, title);
    if (failure) errors.push(failure);
    parts.push(`${channel}=${failure ? "failed" : "ok"}`);
  }
  return {
    delivered: parts.some((part) => part.endsWith("=ok")),
    summary: parts.join(" "),
    errors,
  };
}

/**
 * Prove the pager still reaches the phone, without waiting for a discharge.
 *
 * A successful publish means ntfy.sh accepted the message, not that iOS
 * delivered it or that Critical Alerts are still on, and nothing here can prove
 * those. The only way to find out is to send a real one and ask whether it
 * buzzed, which is the last gate on LAC-6137. Worth re-running after an iOS
 * update or a phone change.
 *
 * Says it is a test in its own first words, so a stray self-test can never be
 * mistaken for the outage it is practising for.
 */
const SELF_TEST_TITLE = "Power watch self-test";
const SELF_TEST_TEXT =
  "Fleet power watch self-test from zero. Nothing is wrong and nothing is down. " +
  "This is the Critical Alert you get at 10% battery, while plugging in still " +
  "costs ten seconds instead of three hours. If this did not buzz through Do Not " +
  "Disturb, the pager is off and the next outage goes unnoticed.";

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--self-test")) {
    const result = await notify(SELF_TEST_TEXT, SELF_TEST_TITLE, ["slack", "ntfy"]);
    say(`SELF-TEST ${result.summary}`);
    for (const error of result.errors) fail(error);
    process.exit(result.delivered ? 0 : 2);
  }

  const i = argv.indexOf("--state");
  const stateArg = i >= 0 ? argv[i + 1] : undefined;
  const statePath = stateArg ? path.resolve(stateArg) : DEFAULT_STATE_PATH;

  let output: string;
  try {
    output = await readPmset();
  } catch (error) {
    fail(`could not run pmset: ${(error as Error).message}`);
    process.exit(2);
  }

  const state = parsePmset(output);
  if (state === null) {
    // Exit 2, not 0. "Could not look" and "the power is fine" are the two
    // readings this file exists to keep apart.
    fail(`could not read the power state from pmset:\n${output.trim()}`);
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
  say(formatAlert(state));

  if (decision.tier !== null && argv.includes("--notify")) {
    const result = await notify(formatAlert(state), ntfyTitle(state), channelsFor(decision.tier));
    // The one line that shows a half-delivered warning. Without it the working
    // channel looks like the only channel and a dead pager stays invisible.
    say(`SENT at ${decision.tier}% ${result.summary}`);
    for (const error of result.errors) fail(error);
    // Written only on a delivered warning, so an outage in the notifier retries
    // in five minutes instead of silently spending the one warning this
    // discharge was owed.
    if (result.delivered) await writeAlerted(statePath, decision.nextAlerted);
  }

  process.exit(1);
}

// Guarded so the pure helpers above can be imported by tests without touching
// pmset, the filesystem or Slack.
if (import.meta.main) {
  main().catch((error) => {
    fail(`power watch failed: ${(error as Error)?.stack ?? String(error)}`);
    process.exit(2);
  });
}
