/**
 * Every ops test gets its own Slack send-gate state directory (LAC-8649).
 *
 * The seven bash senders source `scripts/slack-send-gate.sh` from beside
 * themselves, which is exactly how launchd runs them: the plists `cd` into
 * `~/repo/buildandserve-ops` and exec `scripts/<sender>.sh`. So a sender test
 * spawns the real gate, and the gate's default state directory is
 * `~/.paperclip/state/slack-send-gate` on whoever ran the suite. That file is
 * a rolling seven-day counter, so without a directory of its own a sender test
 * is not idempotent and not isolated.
 *
 * Measured 2026-11-19 on zero. A run of `tests/node/ops/tailscale-watchdog.test.ts`
 * against an empty live directory passes and books 14 of that sender's declared
 * weekly ceiling of 20. The next run in the same seven days starts at 14, the
 * gate suppresses the sends the arms assert, and 10 of the 32 arms fail; by the
 * third run it is the ceiling. The live file this was found in held 113 fixture
 * messages, 53 from that file and 60 from `fleet-dark-watch.test.ts`, and had
 * already spent the whole tailscale-watchdog week. A test suite may not spend a
 * live allowance, and run N may not see run N-1's count.
 *
 * Per test, not per file: 14 arms of one file already cross most of a ceiling,
 * so a per-file directory would only move the cliff.
 *
 * The gate itself is tested in `tests/node/ops/slack-send-gate.test.ts`, which
 * passes `SLACK_GATE_DIR` explicitly on every spawn and so is unaffected.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";

let gateRoot: string | undefined;

beforeEach(() => {
  gateRoot = mkdtempSync(path.join(tmpdir(), "vitest-slack-gate-"));
  // Both, because the gate falls back to /tmp/slack-send-gate when the primary
  // directory will not take a write, and that is shared too.
  process.env.SLACK_GATE_DIR = path.join(gateRoot, "state");
  process.env.SLACK_GATE_FALLBACK_DIR = path.join(gateRoot, "fallback");
});

afterEach(() => {
  if (gateRoot) rmSync(gateRoot, { recursive: true, force: true });
  gateRoot = undefined;
});
