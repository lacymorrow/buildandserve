import { execFile, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

const GATE = path.resolve(__dirname, "../../../scripts/slack-send-gate.sh");
const INSTALLER = path.resolve(__dirname, "../../../scripts/slack-send-gate-install.sh");

/** Lacy's DM. Both forms reach the same conversation and both are in live use. */
const DM = "D0A77QE1B9V";
const DM_USER = "U3XC80UUQ";

/**
 * The measured defect class (LAC-8649): 15 byte-identical DMs, 23 characters,
 * non-empty, so `slack-post.sh`'s existing `[ -z "$TEXT" ]` could never fire.
 */
const DEFECT = "Post queue 2026-11-18:$";

/** The shortest legitimate DM in 30 days of history: 73 characters. */
const SHORTEST_REAL = "GitHub mirror on library is working again, after 14d 0h of [api-http-401]";

let dir: string;
let gatePath: string;

/**
 * Exit codes are the contract, because the three TypeScript watchers read them
 * over `spawnSync` and cannot see a bash function's return value.
 */
const SEND = 0;
const DROPPED_FLOOR = 10;
const SUPPRESSED_CEILING = 11;

interface Verdict {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * One gate decision. `script` lets a mutant stand in for the real gate without
 * any other part of the call changing, which is what makes a mutant arm a test
 * of the assert rather than a second test of the gate.
 */
async function check(
  sender: string,
  text: string,
  opts: { channel?: string; env?: Record<string, string>; script?: string } = {},
): Promise<Verdict> {
  const script = opts.script ?? gatePath;
  // spawnSync, not execFile: the gate reads the message on stdin, and
  // execFile has no `input` option, so an execFile call leaves stdin open and
  // the gate's `cat` never returns.
  const result = spawnSync("bash", [script, "--check", sender, opts.channel ?? DM], {
    env: { ...process.env, SLACK_GATE_DIR: dir, ...(opts.env ?? {}) },
    input: text,
    encoding: "utf8",
    timeout: 20_000,
  });
  if (result.error) throw result.error;
  return { code: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** Every decision the gate recorded, oldest first. */
async function records(): Promise<Record<string, unknown>[]> {
  const raw = await readFile(path.join(dir, "decisions.jsonl"), "utf8").catch(() => "");
  return raw
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

/**
 * A copy of the gate with one line changed. Each arm below names the assert it
 * is meant to break, and the paired `expect` is the opposite of the real
 * behaviour: a mutant that still passes the original assert means the assert
 * was never guarding that branch.
 */
async function mutate(sed: string): Promise<string> {
  const target = path.join(dir, `mutant-${Math.random().toString(36).slice(2)}.sh`);
  // sed is spawned directly, never through a shell. The expressions below match
  // lines containing `$len`, `$floor`, `$sender` and friends, and a shell would
  // expand every one of those to the empty string, leaving an expression that
  // matches nothing and a "mutant" identical to the original. That silently
  // turns all five mutant arms green and proves nothing.
  const result = spawnSync("sed", [sed, GATE], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`sed failed: ${result.stderr}`);
  await writeFile(target, result.stdout);
  // Guard against exactly the failure above: a mutant that is byte-identical to
  // the gate is not a mutant.
  const original = await readFile(GATE, "utf8");
  if (result.stdout === original) throw new Error(`mutant did not change anything: ${sed}`);
  await chmod(target, 0o755);
  return target;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "slack-gate-"));
  gatePath = GATE;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("the content floor", () => {
  it("drops the measured 23-character defect", async () => {
    const v = await check("post-queue", DEFECT);
    expect(v.code).toBe(DROPPED_FLOOR);
  });

  it("MUTANT drop-the-floor: the defect sends", async () => {
    const mutant = await mutate("s/^  if \\[ \"\\$len\" -lt \"\\$floor\" \\]; then$/  if false; then/");
    const v = await check("post-queue", DEFECT, { script: mutant });
    expect(v.code).toBe(SEND);
  });

  it("passes the shortest legitimate DM in 30 days of history", async () => {
    expect(SHORTEST_REAL.length).toBe(73);
    const v = await check("library-mirror-refresh", SHORTEST_REAL);
    expect(v.code).toBe(SEND);
  });

  it("sits inside the measured empty band: 39 drops, 40 sends", async () => {
    const at39 = "x".repeat(39);
    const at40 = "x".repeat(40);
    expect((await check("post-queue", at39)).code).toBe(DROPPED_FLOOR);
    expect((await check("post-queue", at40)).code).toBe(SEND);
  });

  it("measures content, not padding: whitespace cannot buy a message over the floor", async () => {
    // The defect plus 40 characters of newlines and spaces is 63 raw characters
    // and still says nothing. A raw-length floor would pass it.
    const padded = `${DEFECT}\n\n\n\n     \n\n\n\n          \n\n\n\n     `;
    expect(padded.length).toBeGreaterThan(40);
    expect((await check("post-queue", padded)).code).toBe(DROPPED_FLOOR);
  });

  it("MUTANT raw-length floor: the padded defect sends", async () => {
    const mutant = await mutate('s/^  len=\\$(slack_gate_content_length "\\$text")$/  len=${#text}/');
    const padded = `${DEFECT}\n\n\n\n     \n\n\n\n          \n\n\n\n     `;
    expect((await check("post-queue", padded, { script: mutant })).code).toBe(SEND);
  });
});

describe("the per-sender weekly ceiling", () => {
  it("suppresses the eighth send for a sender on the bare default of 7", async () => {
    for (let i = 0; i < 7; i++) {
      const v = await check("bas-projects-db-watch", `${SHORTEST_REAL} #${i}`);
      expect(v.code).toBe(SEND);
    }
    const eighth = await check("bas-projects-db-watch", `${SHORTEST_REAL} #7`);
    expect(eighth.code).toBe(SUPPRESSED_CEILING);
  });

  it("MUTANT drop-the-ceiling-check: the eighth send goes out", async () => {
    const mutant = await mutate("s/^  if \\[ \"\\$count\" -ge \"\\$ceiling\" \\]; then$/  if false; then/");
    for (let i = 0; i < 8; i++) {
      const v = await check("bas-projects-db-watch", `${SHORTEST_REAL} #${i}`, { script: mutant });
      expect(v.code).toBe(SEND);
    }
  });

  it("honours a declared ceiling above the default, so the governor is not gagged", async () => {
    // usage-governor peaked at 93 DMs in one week over the measured 30 days.
    // A bare default of 7 would have silenced 86 of them.
    for (let i = 0; i < 20; i++) {
      const v = await check("usage-governor", `${SHORTEST_REAL} #${i}`);
      expect(v.code).toBe(SEND);
    }
  });

  it("MUTANT ignore-the-registry: the governor is gagged at 7", async () => {
    const mutant = await mutate(
      's/^  ceiling=\\$(slack_gate_ceiling_for "\\$sender")$/  ceiling=$SLACK_GATE_DEFAULT_CEILING/',
    );
    let suppressed = 0;
    for (let i = 0; i < 20; i++) {
      const v = await check("usage-governor", `${SHORTEST_REAL} #${i}`, { script: mutant });
      if (v.code === SUPPRESSED_CEILING) suppressed++;
    }
    expect(suppressed).toBe(13);
  });

  it("counts a rolling seven days, so a send eight days old does not count", async () => {
    const eightDaysAgo = Math.floor(Date.now() / 1000) - 8 * 86400;
    const stale = Array.from({ length: 20 }, () => `${eightDaysAgo}\tbas-projects-db-watch`).join("\n");
    await writeFile(path.join(dir, "sends.tsv"), `${stale}\n`);
    const v = await check("bas-projects-db-watch", SHORTEST_REAL);
    expect(v.code).toBe(SEND);
  });

  it("does not count its own dropped and suppressed messages as sends", async () => {
    for (let i = 0; i < 10; i++) expect((await check("bas-projects-db-watch", DEFECT)).code).toBe(DROPPED_FLOOR);
    // Ten floor drops must leave the whole weekly allowance intact.
    for (let i = 0; i < 7; i++) {
      expect((await check("bas-projects-db-watch", `${SHORTEST_REAL} #${i}`)).code).toBe(SEND);
    }
  });
});

describe("the fleet-dark-watch exemption", () => {
  it("lets the dead-man's switch past the ceiling", async () => {
    // It sent 24 DMs in its busiest measured week and a suppressed outage alarm
    // is strictly worse than a noisy channel (LAC-5366).
    for (let i = 0; i < 30; i++) {
      const v = await check("fleet-dark-watch", `${SHORTEST_REAL} #${i}`);
      expect(v.code).toBe(SEND);
    }
  });

  it("MUTANT drop-the-exemption: the outage alarm is gagged after 7", async () => {
    const mutant = await mutate('s/^  if slack_gate_is_exempt "\\$sender"; then$/  if false; then/');
    let suppressed = 0;
    for (let i = 0; i < 30; i++) {
      const v = await check("fleet-dark-watch", `${SHORTEST_REAL} #${i}`, { script: mutant });
      if (v.code === SUPPRESSED_CEILING) suppressed++;
    }
    expect(suppressed).toBeGreaterThan(0);
  });

  it("is an exemption from the ceiling only, never from the floor", async () => {
    const v = await check("fleet-dark-watch", DEFECT);
    expect(v.code).toBe(DROPPED_FLOOR);
  });

  it("is a named exemption, not a ceiling of 999", async () => {
    const { stdout } = await run("bash", [GATE, "--registry"]);
    const row = stdout.split("\n").find((l) => l.startsWith("fleet-dark-watch\t"));
    expect(row).toBeDefined();
    expect(row?.split("\t")[1]).toBe("exempt");
  });
});

describe("the record the Sunday digest reads (LAC-8648)", () => {
  it("records a floor drop with the dropped text", async () => {
    await check("post-queue", DEFECT);
    const rows = await records();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sender: "post-queue", decision: "dropped_floor", text: DEFECT });
    expect(rows[0].chars).toBe(23);
  });

  it("records a ceiling suppression with the suppressed text", async () => {
    for (let i = 0; i < 7; i++) await check("bas-projects-db-watch", `${SHORTEST_REAL} #${i}`);
    await check("bas-projects-db-watch", `${SHORTEST_REAL} #suppressed`);
    const rows = await records();
    const sup = rows.filter((r) => r.decision === "suppressed_ceiling");
    expect(sup).toHaveLength(1);
    expect(sup[0]).toMatchObject({ sender: "bas-projects-db-watch", ceiling: 7 });
    expect(sup[0].text).toBe(`${SHORTEST_REAL} #suppressed`);
  });

  it("MUTANT drop-the-suppression-record: the suppression is invisible", async () => {
    const mutant = await mutate('s/^    slack_gate_record "suppressed_ceiling".*$//');
    for (let i = 0; i < 7; i++) await check("bas-projects-db-watch", `${SHORTEST_REAL} #${i}`, { script: mutant });
    const v = await check("bas-projects-db-watch", `${SHORTEST_REAL} #gone`, { script: mutant });
    expect(v.code).toBe(SUPPRESSED_CEILING);
    expect((await records()).filter((r) => r.decision === "suppressed_ceiling")).toHaveLength(0);
  });

  it("says loudly on stderr what it dropped, so a false positive is findable", async () => {
    const v = await check("post-queue", DEFECT);
    expect(v.stderr).toContain("post-queue");
    expect(v.stderr).toMatch(/dropped/i);
  });
});

describe("fail open", () => {
  it("sends when the state directory cannot be written", async () => {
    const locked = path.join(dir, "locked");
    await mkdir(locked);
    await chmod(locked, 0o500);
    const v = await check("post-queue", SHORTEST_REAL, {
      env: { SLACK_GATE_DIR: path.join(locked, "state"), SLACK_GATE_FALLBACK_DIR: path.join(locked, "fallback") },
    });
    await chmod(locked, 0o700);
    expect(v.code).toBe(SEND);
    expect(v.stderr).toMatch(/fail(ing)? open/i);
  });

  it("MUTANT fail-closed: a full disk silences the channel", async () => {
    const mutant = await mutate('s/^    return 0  # fail open$/    return 1/');
    const locked = path.join(dir, "locked2");
    await mkdir(locked);
    await chmod(locked, 0o500);
    const v = await check("post-queue", SHORTEST_REAL, {
      script: mutant,
      env: { SLACK_GATE_DIR: path.join(locked, "state"), SLACK_GATE_FALLBACK_DIR: path.join(locked, "fallback") },
    });
    await chmod(locked, 0o700);
    expect(v.code).not.toBe(SEND);
  });

  it("still gates, and still records, on the fallback directory", async () => {
    // zero reached zero bytes free on 2026-11-16. The primary state directory
    // going away must degrade to /tmp, not to no gate and not to no record.
    const locked = path.join(dir, "locked3");
    await mkdir(locked);
    await chmod(locked, 0o500);
    const fallback = path.join(dir, "fallback");
    const v = await check("post-queue", DEFECT, {
      env: { SLACK_GATE_DIR: path.join(locked, "state"), SLACK_GATE_FALLBACK_DIR: fallback },
    });
    await chmod(locked, 0o700);
    expect(v.code).toBe(DROPPED_FLOOR);
    const raw = await readFile(path.join(fallback, "decisions.jsonl"), "utf8");
    expect(JSON.parse(raw.trim())).toMatchObject({ decision: "dropped_floor", text: DEFECT });
  });

  it("sends when the gate is absent entirely, because every sender stubs it", async () => {
    // The stub each sender carries is the fail-open path for a host the gate was
    // never installed on. Asserted against the real stub text in the senders.
    const { stdout } = await run("bash", [
      "-c",
      `grep -c 'slack_gate_allows() { return 0; }' ${JSON.stringify(
        path.resolve(__dirname, "../../../scripts/fleet-dark-watch.sh"),
      )}`,
    ]);
    expect(Number(stdout.trim())).toBeGreaterThan(0);
  });
});

describe("scope", () => {
  it("gates both forms of Lacy's DM", async () => {
    expect((await check("post-queue", DEFECT, { channel: DM })).code).toBe(DROPPED_FLOOR);
    expect((await check("post-queue", DEFECT, { channel: DM_USER })).code).toBe(DROPPED_FLOOR);
  });

  it("passes other channels through ungated and unrecorded", async () => {
    // `tools/launchd-domain-drift/domain-drift-check.sh` posts to #dev every ten
    // minutes through the same `slack-post.sh`. The 40-character floor is
    // justified by DM data only, so #dev is not its to police.
    const v = await check("domain-drift", DEFECT, { channel: "dev" });
    expect(v.code).toBe(SEND);
    expect(await records()).toHaveLength(0);
  });
});

describe("the declared-ceiling registry", () => {
  it("declares a ceiling for every sender in the 30-day census", async () => {
    const { stdout } = await run("bash", [GATE, "--registry"]);
    const declared = new Set(stdout.split("\n").filter(Boolean).map((l) => l.split("\t")[0]));
    for (const sender of [
      "usage-governor",
      "fleet-dark-watch",
      "fleet-power-watch",
      "lacy-qa-ping",
      "post-queue",
      "fleet-health-check",
      "paperclip-stranded-watch",
      "tailscale-watchdog",
      "library-mirror-refresh",
      "doug-store-watch-freshness",
      "adhoc",
      "juno-demo-rig",
      "bas-projects-db-watch",
    ]) {
      expect(declared, `no declared ceiling for ${sender}`).toContain(sender);
    }
  });

  it("carries the measured peak beside each declared ceiling, so the digest can print the gap", async () => {
    const { stdout } = await run("bash", [GATE, "--registry"]);
    const rows = stdout.split("\n").filter(Boolean).map((l) => l.split("\t"));
    for (const row of rows) expect(row, `malformed registry row: ${row.join("|")}`).toHaveLength(3);
    const governor = rows.find((r) => r[0] === "usage-governor");
    expect(governor?.[1]).toBe("150");
    expect(governor?.[2]).toBe("93");
  });

  it("gives an undeclared sender the bare default of 7, and says so", async () => {
    const { stdout } = await run("bash", [GATE, "--ceiling", "something-new"]);
    expect(stdout.trim()).toBe("7");
  });
});

describe("the slack-post.sh installer", () => {
  /** The real file, as it stands on both hosts before this change. */
  const ORIGINAL = `#!/bin/bash
set -u
set -o pipefail
CHANNEL=""; THREAD=""; TEXT=""; FORCE=0; DRY=0; WINDOW=600
while [ $# -gt 0 ]; do
  case "$1" in
    -c|--channel) CHANNEL="$2"; shift 2 ;;
    -m|--text)    TEXT="$2"; shift 2 ;;
    *) echo "slack-post.sh: unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -z "$TEXT" ] && { echo "slack-post.sh: empty message, nothing posted" >&2; exit 2; }
PAYLOAD=$(jq -n --arg channel "$CHANNEL" --arg text "$TEXT" '{channel: $channel, text: $text}')
echo "POSTED:$TEXT"
`;

  /** The three host-local callers, each at its real anchor line. */
  const CALLERS: Record<string, string> = {
    ".paperclip/scripts/usage-governor.py": [
      "        subprocess.run([str(SLACK_POST), \"-c\", SLACK_DM, \"-m\", msg], timeout=30,",
      "                       capture_output=True, text=True)",
    ].join("\n"),
    ".paperclip/scripts/lacy-qa-ping.sh": [
      "#!/bin/bash",
      'printf \'%s\' "$TEXT" | "$HOME/.openclaw/scripts/slack-post.sh" -c "$LACY_SLACK" --force $DRY || exit $?',
    ].join("\n"),
    ".paperclip/fleet-health-check.sh": [
      "#!/bin/bash",
      'if out=$(with_timeout 90 "$SLACK_POST" -c "$SLACK_CHANNEL" -m "$1" 2>&1); then',
      '  if out=$(with_timeout 90 "$SLACK_POST" -c "$LACY_DM" -m "$1" 2>&1); then',
    ].join("\n"),
  };

  let host: string;

  beforeEach(async () => {
    host = await mkdtemp(path.join(tmpdir(), "slack-host-"));
    await mkdir(path.join(host, "scripts"), { recursive: true });
    await writeFile(path.join(host, "scripts", "slack-post.sh"), ORIGINAL);
    await chmod(path.join(host, "scripts", "slack-post.sh"), 0o755);
    for (const [rel, body] of Object.entries(CALLERS)) {
      await mkdir(path.join(host, path.dirname(rel)), { recursive: true });
      await writeFile(path.join(host, rel), `${body}\n`);
    }
  });

  afterEach(async () => {
    await rm(host, { recursive: true, force: true });
  });

  /**
   * SLACK_GATE_CALLER_HOME is not optional in a test. Without it the installer
   * defaults to $HOME and a test run would rewrite the live usage-governor,
   * lacy-qa-ping and fleet-health-check on this machine.
   */
  const install = () =>
    run("bash", [INSTALLER], {
      env: {
        ...process.env,
        SLACK_GATE_INSTALL_DIR: path.join(host, "scripts"),
        SLACK_GATE_CALLER_HOME: host,
      },
    } as never);

  it("installs the gate beside slack-post.sh and makes it drop the defect", async () => {
    await install();
    const post = path.join(host, "scripts", "slack-post.sh");
    await expect(
      run("bash", [post, "-c", DM, "--sender", "post-queue", "-m", DEFECT], {
        env: { ...process.env, SLACK_GATE_DIR: dir },
      } as never),
    ).rejects.toMatchObject({ code: DROPPED_FLOOR });
    const { stdout } = await run("bash", [post, "-c", DM, "--sender", "post-queue", "-m", SHORTEST_REAL], {
      env: { ...process.env, SLACK_GATE_DIR: dir },
    } as never);
    expect(stdout).toContain(`POSTED:${SHORTEST_REAL}`);
  });

  it("accepts a caller with no --sender and books it as adhoc", async () => {
    await install();
    const post = path.join(host, "scripts", "slack-post.sh");
    const { stdout } = await run("bash", [post, "-c", DM, "-m", SHORTEST_REAL], {
      env: { ...process.env, SLACK_GATE_DIR: dir },
    } as never);
    expect(stdout).toContain("POSTED:");
    expect((await records())[0]).toMatchObject({ sender: "adhoc", decision: "sent" });
  });

  it("threads --sender through all three host-local callers", async () => {
    await install();
    const governor = await readFile(path.join(host, ".paperclip/scripts/usage-governor.py"), "utf8");
    expect(governor).toContain('"-c", SLACK_DM, "--sender", "usage-governor", "-m", msg');
    const ping = await readFile(path.join(host, ".paperclip/scripts/lacy-qa-ping.sh"), "utf8");
    expect(ping).toContain('-c "$LACY_SLACK" --sender lacy-qa-ping --force');
    const health = await readFile(path.join(host, ".paperclip/fleet-health-check.sh"), "utf8");
    // Both call sites, the #dev one and the DM one.
    expect(health).toContain('-c "$SLACK_CHANNEL" --sender fleet-health-check -m "$1"');
    expect(health).toContain('-c "$LACY_DM" --sender fleet-health-check -m "$1"');
  });

  it("without a sender id the governor would be gagged, which is why tagging is verified", async () => {
    // 93 DMs in its busiest measured week against the adhoc ceiling of 25.
    const ceiling = await run("bash", [GATE, "--ceiling", "adhoc"]);
    expect(Number(ceiling.stdout.trim())).toBe(25);
    const declared = await run("bash", [GATE, "--ceiling", "usage-governor"]);
    expect(Number(declared.stdout.trim())).toBe(150);
  });

  it("says so loudly and exits non-zero when a caller anchor has moved", async () => {
    await writeFile(path.join(host, ".paperclip/scripts/lacy-qa-ping.sh"), "#!/bin/bash\n# rewritten\n");
    await expect(install()).rejects.toMatchObject({ code: 1 });
    const result = spawnSync("bash", [INSTALLER], {
      env: { ...process.env, SLACK_GATE_INSTALL_DIR: path.join(host, "scripts"), SLACK_GATE_CALLER_HOME: host },
      encoding: "utf8",
    });
    expect(result.stderr).toContain("CANNOT TAG");
    expect(result.stderr).toContain("lacy-qa-ping");
    // The other two are still tagged: one unreachable caller does not abandon
    // the rest, it just keeps that one sending as adhoc.
    const governor = await readFile(path.join(host, ".paperclip/scripts/usage-governor.py"), "utf8");
    expect(governor).toContain('"--sender", "usage-governor"');
  });

  it("is idempotent and keeps exactly one backup", async () => {
    await install();
    const first = await readFile(path.join(host, "scripts", "slack-post.sh"), "utf8");
    await install();
    expect(await readFile(path.join(host, "scripts", "slack-post.sh"), "utf8")).toBe(first);
    const { stdout } = await run("bash", ["-c", `ls ${JSON.stringify(path.join(host, "scripts"))} | grep -c '\\.bak-'`]);
    expect(Number(stdout.trim())).toBe(1);
  });
});
