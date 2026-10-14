#!/usr/bin/env bun
/**
 * Watches the watch (LAC-4335).
 *
 * `scripts/doug-store-watch.ts` reports a clean store by saying nothing. A run
 * that never starts also says nothing, so the two are identical from outside.
 * On 2026-10-13 the 04:00 ET slot never executed (LAC-4326) and left no
 * evidence directory, no exit code and no signal. Doug's stores went unwatched
 * for four hours and the only way anyone found out was by counting directories
 * afterwards.
 *
 * This reads the evidence the watch leaves behind and alerts when it stops
 * arriving. Two properties make it worth having:
 *
 * 1. **It does not run inside the Paperclip runner.** The runner is the thing
 *    that fails, so a check scheduled by the runner inherits the failure. This
 *    is a plain system cron entry.
 * 2. **It shares no dependency with the watch.** No Playwright, no network, no
 *    database. It reads one JSON file and looks at the clock.
 *
 * Usage:
 *   bun scripts/doug-store-watch-freshness.ts [--notify] [--max-age-hours N]
 *                                             [--evidence <dir>]
 *
 * Exit codes: 0 = the watch is running, 1 = the watch is blind.
 *
 * Output follows the same contract as the watch itself: silence means healthy.
 * When the watch is blind it prints one line, and with `--notify` it Slack-DMs
 * that same line once per gap.
 */

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evidenceBaseFor } from "./utils/store-watch-evidence";

/**
 * The watch runs every 4 hours, so 5 is one full cadence plus an hour of slack
 * for a run that merely started late. Below this and a slow run pages someone;
 * far above it and a genuine blind window lasts most of a day unnoticed.
 */
export const STALE_AFTER_HOURS = 5;

/** Remembers which gap was already reported, so one gap produces one DM. */
const ALERT_STATE_FILE = ".freshness-alert";

export interface RunSummary {
  name: string;
  startedAtMs: number;
}

export interface Staleness {
  stale: boolean;
  /** The most recent run that left evidence, or null if there has never been one. */
  newest: RunSummary | null;
  ageHours: number | null;
  /** The line to print and DM. Null when the watch is healthy. */
  line: string | null;
  /** Stable for as long as one gap lasts, so a repeat check knows to stay quiet. */
  alertKey: string | null;
}

/** Hours, without the trailing `.0` that makes a round number look approximated. */
export function formatAge(hours: number): string {
  return `${Number(hours.toFixed(1))}h`;
}

/** The runbook writes times to Lacy in ET, because that is the clock he reads. */
function easternTime(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const at = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  // Intl renders midnight as hour 24 in some ICU versions; the date is already correct.
  const hour = at("hour") === "24" ? "00" : at("hour");
  return `${at("year")}-${at("month")}-${at("day")} ${hour}:${at("minute")} ET`;
}

/**
 * A run's start time, preferring what the run recorded about itself over the
 * filesystem's opinion. A truncated or timestamp-less report still counts as a
 * run; the point of this check is to notice an *absent* run, so anything that
 * made it to disk gets the benefit of the doubt via its mtime.
 */
export function readStartedAt(reportJson: string, fallbackMs: number): number {
  try {
    const started = (JSON.parse(reportJson) as { startedAt?: unknown }).startedAt;
    if (typeof started !== "string") return fallbackMs;
    const parsed = Date.parse(started);
    return Number.isNaN(parsed) ? fallbackMs : parsed;
  } catch {
    return fallbackMs;
  }
}

/** Is the watch still running, judged only on the newest run that left evidence. */
export function assessStaleness(
  runs: RunSummary[],
  nowMs: number,
  maxAgeHours: number = STALE_AFTER_HOURS
): Staleness {
  const newest = runs.reduce<RunSummary | null>(
    (best, run) => (best === null || run.startedAtMs > best.startedAtMs ? run : best),
    null
  );

  if (newest === null) {
    return {
      stale: true,
      newest: null,
      ageHours: null,
      line: "Store watch is blind: no run has ever been recorded. Doug's stores are unwatched.",
      alertKey: "stale-since:never",
    };
  }

  const ageHours = (nowMs - newest.startedAtMs) / 3_600_000;
  if (ageHours <= maxAgeHours) {
    return { stale: false, newest, ageHours, line: null, alertKey: null };
  }

  return {
    stale: true,
    newest,
    ageHours,
    line:
      `Store watch is blind: no run in ${formatAge(ageHours)}. ` +
      `Last run ${easternTime(newest.startedAtMs)}, expected every 4h. ` +
      `Doug's stores are unwatched.`,
    alertKey: `stale-since:${new Date(newest.startedAtMs).toISOString()}`,
  };
}

/**
 * One DM per gap. The key is pinned to the last good run, so it does not move
 * while the gap lasts and does move the moment a run lands and the next gap
 * opens. Without this an hourly check turns a two-day outage into 48 identical
 * messages, and the next real one gets ignored.
 */
export function shouldNotify(current: Staleness, lastAlertKey: string | null): boolean {
  return current.stale && current.alertKey !== lastAlertKey;
}

/**
 * Every run directory that actually left a report. A directory with no
 * `report.json` is a run that died before producing evidence, which is the
 * condition being alerted on rather than a reason to call the watch healthy.
 */
async function readRuns(base: string): Promise<RunSummary[]> {
  const names = await readdir(base).catch(() => [] as string[]);
  const runs: RunSummary[] = [];
  for (const name of names) {
    const dir = path.join(base, name);
    const info = await stat(dir).catch(() => null);
    if (!info?.isDirectory()) continue;
    const report = await readFile(path.join(dir, "report.json"), "utf8").catch(() => null);
    if (report === null) continue;
    runs.push({ name, startedAtMs: readStartedAt(report, info.mtimeMs) });
  }
  return runs;
}

async function readAlertKey(base: string): Promise<string | null> {
  const raw = await readFile(path.join(base, ALERT_STATE_FILE), "utf8").catch(() => null);
  return raw?.trim() || null;
}

async function writeAlertKey(base: string, key: string): Promise<void> {
  await mkdir(base, { recursive: true });
  await writeFile(path.join(base, ALERT_STATE_FILE), `${key}\n`);
}

/**
 * Slack-DM the line. Credentials come from the environment rather than a path
 * on Lacy's laptop so the Managed Agents trial can run this same file.
 *
 * Returns an error string instead of throwing: a failed DM must still leave the
 * line in the cron log and the exit code at 1. A monitor that goes quiet
 * because its own notifier broke is the bug it was written to prevent.
 */
async function slackDm(line: string): Promise<string | null> {
  const token = process.env.STORE_WATCH_SLACK_TOKEN;
  const channel = process.env.STORE_WATCH_SLACK_CHANNEL;
  if (!token || !channel) {
    return "STORE_WATCH_SLACK_TOKEN and STORE_WATCH_SLACK_CHANNEL must both be set to notify";
  }
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel, text: line }),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    return body.ok ? null : `Slack rejected the message: ${body.error ?? res.status}`;
  } catch (error) {
    return `Slack post failed: ${(error as Error).message}`;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const explicitEvidence = arg("--evidence");
  const base = explicitEvidence ? path.resolve(explicitEvidence) : await evidenceBaseFor(repoRoot);

  const maxAgeRaw = arg("--max-age-hours");
  const maxAgeHours = maxAgeRaw === undefined ? STALE_AFTER_HOURS : Number(maxAgeRaw);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
    console.error(`--max-age-hours must be a positive number, got ${maxAgeRaw}`);
    process.exit(1);
  }

  const verdict = assessStaleness(await readRuns(base), Date.now(), maxAgeHours);
  // Healthy is silent, same contract as the watch. Nothing to say, say nothing.
  if (!verdict.stale || verdict.line === null) process.exit(0);

  console.log(verdict.line);
  console.log(`Evidence: ${base}`);

  if (argv.includes("--notify") && shouldNotify(verdict, await readAlertKey(base))) {
    const failure = await slackDm(verdict.line);
    if (failure) console.error(failure);
    // Recorded only on a delivered DM, so a Slack outage retries next hour
    // instead of silently consuming the one alert this gap was going to get.
    else if (verdict.alertKey) await writeAlertKey(base, verdict.alertKey);
  }

  process.exit(1);
}

// Guarded so the pure helpers above can be imported by tests without touching
// the filesystem or Slack.
if (import.meta.main) {
  main().catch((error) => {
    console.error("freshness check failed:", error);
    process.exit(1);
  });
}
