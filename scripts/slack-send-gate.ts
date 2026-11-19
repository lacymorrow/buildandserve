/**
 * The Slack DM send gate, for the three TypeScript watchers (LAC-8649).
 *
 * This is a thin face over `slack-send-gate.sh`, not a second implementation.
 * The floor, the ceiling, the declared-ceiling registry, the named exemption
 * and the record format exist in exactly one place, so there is no way for a
 * ceiling to be raised in bash and stay low in TypeScript. The cost is one
 * `spawnSync` per alert, and these watchers send single-digit numbers of alerts
 * per week.
 *
 * Fail open, twice over: a missing gate script sends, and a gate that cannot be
 * run sends. zero reached zero bytes free on 2026-11-16, and a gate that fails
 * closed on a full disk silences every alarm during exactly the incident the
 * alarms exist to report.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `import.meta.url` rather than `__dirname`: these watchers run under bun as
// ESM, which is also why `doug-store-watch-freshness.ts` resolves its own
// directory the same way.
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Exit codes `slack-send-gate.sh --check` answers with. */
const DROPPED_FLOOR = 10;
const SUPPRESSED_CEILING = 11;

export type GateDecision = "sent" | "dropped_floor" | "suppressed_ceiling" | "ungated";

export interface GateVerdict {
  /** Whether the caller should post. */
  allowed: boolean;
  decision: GateDecision;
  /** What the gate said on stderr, for the watcher's own log. */
  detail: string;
}

/**
 * Where the gate lives. Beside this file in the repo; beside the script on a
 * host that was installed with `slack-send-gate-install.sh`. `SLACK_GATE_LIB`
 * overrides both, which is how the tests point at a mutant.
 */
export function gateScriptPath(): string | null {
  const candidates = [
    process.env.SLACK_GATE_LIB,
    path.join(HERE, "slack-send-gate.sh"),
    path.join(process.env.HOME ?? "", ".openclaw/scripts/slack-send-gate.sh"),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Ask the gate about one message.
 *
 * `sender` must be an id declared in the gate's registry, or it is held to the
 * bare default of 7 a week.
 */
export function slackGateAllows(sender: string, text: string, channel: string): GateVerdict {
  const script = gateScriptPath();
  if (!script) {
    return { allowed: true, decision: "ungated", detail: "no slack-send-gate.sh found, sending ungated" };
  }
  const result = spawnSync("bash", [script, "--check", sender, channel], {
    input: text,
    encoding: "utf8",
    timeout: 15_000,
  });
  if (result.error || result.status === null) {
    return {
      allowed: true,
      decision: "ungated",
      detail: `slack-send-gate.sh could not run (${result.error?.message ?? "no exit status"}), sending ungated`,
    };
  }
  const detail = (result.stderr ?? "").trim();
  if (result.status === DROPPED_FLOOR) return { allowed: false, decision: "dropped_floor", detail };
  if (result.status === SUPPRESSED_CEILING) return { allowed: false, decision: "suppressed_ceiling", detail };
  // Anything else, including a usage error in the gate itself, sends. A gate
  // that refuses on its own bug is a gate that can cause the outage it watches.
  return { allowed: true, decision: "sent", detail };
}
