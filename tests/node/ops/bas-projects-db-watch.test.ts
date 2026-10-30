import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

const SCRIPT = path.resolve(__dirname, "../../../scripts/bas-projects-db-watch.sh");

/**
 * These cover the auth-failure half of the watch (LAC-6059). The cert half runs
 * over the public internet against a live Let's Encrypt certificate and is not
 * reproducible in a unit test; it is exercised with `--cert-now` against the
 * real box instead, and these tests use `--auth-only` so a machine with no
 * network still gets a useful answer.
 *
 * The box is a fake `ssh` that prints a canned container log. That is the whole
 * input to the check, so handing it a log directly tests the thing itself
 * rather than a mock of it.
 */
let box: { dir: string; bin: string; state: string; secrets: string; log: string };
let server: Server;
let origin: string;
let slackPosts: string[];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      slackPosts.push(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address === "string" || address === null) throw new Error("no port");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "projects-db-watch-"));
  box = {
    dir,
    bin: path.join(dir, "bin"),
    state: path.join(dir, "state"),
    secrets: path.join(dir, "secrets"),
    log: path.join(dir, "container.log"),
  };
  await mkdir(box.bin, { recursive: true });
  await mkdir(box.state, { recursive: true });
  await mkdir(box.secrets, { recursive: true });
  slackPosts = [];
});

afterEach(async () => {
  await rm(box.dir, { recursive: true, force: true });
});

/** A fake `ssh` that prints whatever log the test wrote, or fails on demand. */
async function fakeSsh({ fails = false }: { fails?: boolean } = {}) {
  const file = path.join(box.bin, "ssh");
  await writeFile(
    file,
    fails
      ? [
          "#!/bin/bash",
          'echo "ssh: connect to host bas port 22: Operation timed out" >&2',
          "exit 255",
        ].join("\n")
      : ["#!/bin/bash", `cat "${box.log}"`].join("\n")
  );
  await chmod(file, 0o755);
  return file;
}

/** `%m [%p] ` is the default log_line_prefix, which is what the box runs. */
function received(pid: number, host: string) {
  return `2026-10-28 10:08:52.781 UTC [${pid}] LOG:  connection received: host=${host} port=60414`;
}
function passwordFailed(pid: number, user = "keepsake") {
  return `2026-10-28 10:08:54.550 UTC [${pid}] FATAL:  password authentication failed for user "${user}"`;
}
function noHba(pid: number, host: string, user = "keepsake", db = "shipkit_www") {
  return `2026-10-28 10:08:57.120 UTC [${pid}] FATAL:  no pg_hba.conf entry for host "${host}", user "${user}", database "${db}", SSL encryption`;
}
function authorized(pid: number, user = "keepsake") {
  return `2026-10-28 10:08:53.447 UTC [${pid}] LOG:  connection authorized: user=${user} database=${user} SSL enabled`;
}

/** One failed attempt from `host`, as two correlated lines. */
function attempt(pid: number, host: string, user?: string) {
  return [received(pid, host), passwordFailed(pid, user)];
}

interface Options {
  lines: string[];
  threshold?: number;
  notify?: boolean;
  sshFails?: boolean;
}

async function watch(options: Options) {
  await writeFile(box.log, `${options.lines.join("\n")}\n`);
  const ssh = await fakeSsh({ fails: options.sshFails });

  const args = [SCRIPT, "--auth-only"];
  if (options.notify) args.push("--notify");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SSH_BIN: ssh,
    BAS_SSH: "root@fake",
    STATE_DIR: box.state,
    // Never $HOME/.paperclip/secrets. A test that read the real directory
    // would pass or fail based on this laptop rather than on the code.
    SECRETS_DIR: box.secrets,
    AUTH_FAIL_THRESHOLD: String(options.threshold ?? 20),
    SLACK_API_URL: `${origin}/slack`,
    PROJECTS_DB_SLACK_TOKEN: "xoxb-test-token",
    PROJECTS_DB_SLACK_CHANNEL: "C-TEST",
    // Never the real one. A test that read ~/.openclaw/config.json would be a
    // test that can post to Lacy's DM.
    SLACK_TOKEN_FILE: path.join(box.dir, "no-such-token-file"),
    TZ: "UTC",
  };

  let code = 0;
  let stdout = "";
  try {
    const out = await run("bash", args, { env });
    stdout = out.stdout;
  } catch (error) {
    const failure = error as { code?: number; stdout?: string };
    code = failure.code ?? 1;
    stdout = failure.stdout ?? "";
  }
  return { code, stdout };
}

describe("silence means healthy", () => {
  it("says nothing and exits 0 when nobody failed to authenticate", async () => {
    const result = await watch({ lines: [received(1, "3.86.77.141"), authorized(1)] });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("stays quiet below the threshold, because a few failures is a deploy, not an attack", async () => {
    const lines = [1, 2, 3].flatMap((pid) => attempt(pid, "198.51.100.9"));
    const result = await watch({ lines, threshold: 20 });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});

describe("counting failures from the open port", () => {
  it("reports over the threshold and names the source, the user and the count", async () => {
    const lines = Array.from({ length: 25 }, (_, i) => attempt(i + 1, "198.51.100.9")).flat();
    const result = await watch({ lines, threshold: 20 });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("25 authentication failures");
    expect(result.stdout).toContain("198.51.100.9");
    expect(result.stdout).toContain("password/keepsake x25");
  });

  it("counts `no pg_hba.conf entry` too, which is enumeration rather than a wrong password", async () => {
    const lines = Array.from({ length: 21 }, (_, i) => noHba(i + 1, "198.51.100.9"));
    const result = await watch({ lines, threshold: 20 });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("21 authentication failures");
    expect(result.stdout).toContain("no-hba/keepsake->shipkit_www x21");
  });

  it("takes the source for a password failure from the `connection received` line for the same PID", async () => {
    // Postgres does not put the client address on the FATAL line. Two different
    // hosts interleaved is the case that a naive "last host seen" parse breaks.
    const lines = [
      received(10, "198.51.100.9"),
      received(11, "203.0.113.4"),
      passwordFailed(11),
      passwordFailed(10),
    ];
    const result = await watch({ lines, threshold: 1 });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("198.51.100.9");
    expect(result.stdout).toContain("203.0.113.4");
  });

  it("ranks sources so the busiest one is the first thing read", async () => {
    const lines = [
      ...Array.from({ length: 5 }, (_, i) => attempt(i + 100, "203.0.113.4")).flat(),
      ...Array.from({ length: 30 }, (_, i) => attempt(i + 200, "198.51.100.9")).flat(),
    ];
    const result = await watch({ lines, threshold: 10 });
    const body = result.stdout.slice(result.stdout.indexOf("198.51.100.9"));
    expect(body.indexOf("198.51.100.9")).toBeLessThan(body.indexOf("203.0.113.4"));
  });
});

describe("what is not an incident", () => {
  it("ignores the tailnet, because ops typing a password wrong is not an attack", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => attempt(i + 1, "100.86.145.8")).flat();
    const result = await watch({ lines, threshold: 0 });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("ignores loopback and the docker bridge, which are the box talking to itself", async () => {
    const lines = [
      ...Array.from({ length: 20 }, (_, i) => attempt(i + 1, "127.0.0.1")).flat(),
      ...Array.from({ length: 20 }, (_, i) => attempt(i + 50, "172.17.0.1")).flat(),
    ];
    const result = await watch({ lines, threshold: 0 });
    expect(result.code).toBe(0);
  });

  it("drops a failure it cannot attribute rather than guessing a source", async () => {
    // `docker logs --since` cuts mid-session, so the `connection received` line
    // for an early PID is routinely outside the window.
    const lines = [passwordFailed(99), passwordFailed(98)];
    const result = await watch({ lines, threshold: 0 });
    expect(result.code).toBe(0);
  });

  it("separates the tailnet from the open port in the same log", async () => {
    const lines = [
      ...Array.from({ length: 50 }, (_, i) => attempt(i + 1, "100.86.145.8")).flat(),
      ...Array.from({ length: 4 }, (_, i) => attempt(i + 100, "198.51.100.9")).flat(),
    ];
    const result = await watch({ lines, threshold: 3 });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("4 authentication failures");
    expect(result.stdout).not.toContain("100.86.145.8");
  });
});

describe("a fault on our side is never an incident", () => {
  it("voids rather than pages when the tailnet cannot be reached", async () => {
    const result = await watch({ lines: [], sshFails: true, threshold: 0, notify: true });
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("no claim is made");
    expect(slackPosts).toHaveLength(0);
  });

  it("voids on an empty log, because a container that logged nothing proves nothing", async () => {
    const result = await watch({ lines: [], threshold: 0 });
    expect(result.code).toBe(3);
  });
});

describe("paging", () => {
  it("posts to Slack only with --notify", async () => {
    const lines = Array.from({ length: 25 }, (_, i) => attempt(i + 1, "198.51.100.9")).flat();

    await watch({ lines, threshold: 20 });
    expect(slackPosts).toHaveLength(0);

    await watch({ lines, threshold: 20, notify: true });
    expect(slackPosts).toHaveLength(1);
    const posted = JSON.parse(slackPosts[0]) as { channel: string; text: string };
    expect(posted.channel).toBe("C-TEST");
    expect(posted.text).toContain("25 authentication failures");
    expect(posted.text).toContain("docs/ops/bas-projects-db.md");
  });
});

describe("the cert check keeps its own cadence", () => {
  it("does not touch the network for the cert when it is not due", async () => {
    // A watch that ran the cert probe every hour would be fine, and would also
    // be a watch nobody can run on a plane. The stamp is what makes the hourly
    // auth cadence free.
    await writeFile(box.log, `${[received(1, "3.86.77.141"), authorized(1)].join("\n")}\n`);
    const ssh = await fakeSsh();
    const stamp = path.join(box.state, "projects-db-cert-checked-at");
    await writeFile(stamp, String(Math.floor(Date.now() / 1000)));

    // No --auth-only here: the cert check is skipped by the stamp, not by a flag.
    const out = await run("bash", [SCRIPT], {
      env: {
        ...process.env,
        SSH_BIN: ssh,
        BAS_SSH: "root@fake",
        STATE_DIR: box.state,
        SECRETS_DIR: box.secrets,
        CERT_STAMP: stamp,
        AUTH_FAIL_THRESHOLD: "20",
        // Unreachable, so a cert probe that did run would be visible as a failure.
        DB_HOST: "projects-db.invalid",
        PUBLIC_RESOLVER: "127.0.0.1",
        SLACK_TOKEN_FILE: path.join(box.dir, "none"),
        TZ: "UTC",
      },
    });
    expect(out.stdout).toBe("");
    expect(await readFile(stamp, "utf8")).not.toBe("");
  });
});

/**
 * The client-certificate half (LAC-6060).
 *
 * This half shells out to the box's own `client-cert-check`, so the box is a
 * fake `ssh` that dispatches on the command it is handed: the auth check asks
 * for `docker logs`, this one asks for `client-cert-check`, and one fake has to
 * answer both. `--auth-only` is not passed here, so the cert cadence runs; the
 * public-internet half is allowed to do whatever it does and only the client
 * findings are asserted.
 */
async function fakeBox({
  exit,
  output,
  poolerExit = 0,
  poolerOutput = "",
}: {
  exit: number;
  output: string;
  poolerExit?: number;
  poolerOutput?: string;
}) {
  const file = path.join(box.bin, "ssh-box");
  await writeFile(
    file,
    [
      "#!/bin/bash",
      "# The remote command is whichever argument mentions one of the three.",
      'for arg in "$@"; do',
      "  case $arg in",
      "  *client-cert-check*)",
      `    cat <<'OUT'`,
      output,
      "OUT",
      `    exit ${exit} ;;`,
      "  *pooler-cert-check*)",
      `    cat <<'POOL'`,
      poolerOutput,
      "POOL",
      `    exit ${poolerExit} ;;`,
      "  *docker*logs*)",
      `    cat "${box.log}"; exit 0 ;;`,
      "  esac",
      "done",
      "exit 0",
    ].join("\n")
  );
  await chmod(file, 0o755);
  return file;
}

async function certWatch(
  boxExit: number,
  boxOutput: string,
  pooler: { exit: number; output: string } = { exit: 0, output: "" }
) {
  await writeFile(box.log, "");
  const ssh = await fakeBox({
    exit: boxExit,
    output: boxOutput,
    poolerExit: pooler.exit,
    poolerOutput: pooler.output,
  });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SSH_BIN: ssh,
    BAS_SSH: "root@fake",
    STATE_DIR: box.state,
    CERT_EVERY_HOURS: "0",
    // check_secret_modes runs on every invocation, including this one. Left
    // unset it would default to the real ~/.paperclip/secrets and page on
    // whatever modes that host happens to have, so point it at the sandbox.
    SECRETS_DIR: box.secrets,
    // The public-internet cert half is not the subject here, and it must not
    // reach the real box from a test. Both the name and the control name are
    // unresolvable, so that half voids rather than reporting a false outage,
    // which is the same rule it applies to a DNS-blind laptop.
    DB_HOST: "projects-db.invalid.test",
    CONTROL_NAME: "control.invalid.test",
    SLACK_API_URL: `${origin}/slack`,
    SLACK_TOKEN_FILE: path.join(box.dir, "no-such-token-file"),
    TZ: "UTC",
  };
  let code = 0;
  let stdout = "";
  try {
    stdout = (await run("bash", [SCRIPT], { env })).stdout;
  } catch (error) {
    const failure = error as { code?: number; stdout?: string };
    code = failure.code ?? 1;
    stdout = failure.stdout ?? "";
  }
  return { code, stdout };
}

describe("client-certificate expiry", () => {
  it("reports every finding the box printed, and exits 1", async () => {
    const result = await certWatch(
      1,
      [
        "projects-db client-certificate problem:",
        "  - client CA expires in 12d; every project that requires a client cert goes down together on that date",
        "  - client cert for keepsake expires in 30d; reissue with '/usr/local/sbin/bas-projects-db.sh client-cert keepsake' and update that project's Vercel env",
      ].join("\n")
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("client CA expires in 12d");
    expect(result.stdout).toContain("client cert for keepsake expires in 30d");
  });

  it("stays silent about client certs when the box is clean", async () => {
    const result = await certWatch(0, "");
    expect(result.stdout).not.toContain("client");
  });

  it("voids rather than pages when the box cannot be reached", async () => {
    // Exit 255 is ssh itself. A watch that read that as "the CA is gone" would
    // page on every closed laptop lid.
    const result = await certWatch(255, "ssh: connect to host bas port 22: Operation timed out");
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("could not run client-cert-check");
  });

  it("voids rather than pages when the box has an older script without the command", async () => {
    const result = await certWatch(2, "usage: /usr/local/sbin/bas-projects-db.sh {bootstrap|...}");
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("could not run client-cert-check");
  });
});

/**
 * The pooled port's certificate (LAC-6122 F1).
 *
 * The fault being guarded is specific: certbot renews, the deploy hook reloads
 * Postgres, the pooler is never told, and :26432 reads perfect while PgBouncer
 * keeps serving a certificate that expires. Every pooled app is verify-full, so
 * the outage is total, timed, and invisible to the check on the other port.
 */
describe("the certificate on the pooled port", () => {
  it("reports the drift the box found, and exits 1", async () => {
    const result = await certWatch(0, "", {
      exit: 1,
      output: [
        "projects-db pooler certificate problem:",
        "  - the pooler serves AA:BB but /data/projects-db/conf/server.crt is CC:DD; a renewal landed without a pooler RELOAD, so every pooled project goes down at the old cert's expiry. Fix: /usr/local/sbin/bas-projects-db.sh cert-deploy",
      ].join("\n"),
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("a renewal landed without a pooler RELOAD");
  });

  it("stays silent when the pooler is healthy, or absent", async () => {
    // The box-side check exits 0 for both, because a box with no pooler is a
    // supported shape rather than a finding.
    const result = await certWatch(0, "", { exit: 0, output: "" });
    expect(result.stdout).not.toContain("pooler");
  });

  it("voids rather than pages when the box cannot be reached", async () => {
    const result = await certWatch(0, "", {
      exit: 255,
      output: "ssh: connect to host bas port 22: Operation timed out",
    });
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("could not run pooler-cert-check");
  });

  it("voids rather than pages when the box has an older script without the command", async () => {
    // The pooler check landed after the script was already installed on the
    // box, so "this copy does not have the subcommand" is a real state and it
    // proves nothing either way.
    const result = await certWatch(0, "", {
      exit: 2,
      output: "usage: /usr/local/sbin/bas-projects-db.sh {bootstrap|...}",
    });
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("could not run pooler-cert-check");
  });
});

describe("secret file modes", () => {
  /** Writes a secret file at an explicit mode and returns its path. */
  async function secret(name: string, mode: number) {
    const file = path.join(box.secrets, name);
    await writeFile(file, "DATABASE_URL=postgresql://u:pw@projects-db.cloud0.dev:26432/d\n");
    await chmod(file, mode);
    return file;
  }

  const quiet = [received(1, "3.86.77.141"), authorized(1)];

  it("is silent when every credential file is 600", async () => {
    await secret("keepsake-db.env", 0o600);
    await secret("shipkit-www-db.env", 0o600);
    const result = await watch({ lines: quiet });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("catches the backup copy left world-readable, which is the real regression", async () => {
    // LAC-6059 chmod'd the file it rewrote and not the .bak it made first.
    // The agent shell's umask is 022, so the copy landed at 644.
    await secret("keepsake-db.env", 0o600);
    await secret("keepsake-db.env.bak-LAC-6059-20261028", 0o644);
    const result = await watch({ lines: quiet });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("keepsake-db.env.bak-LAC-6059-20261028 is 644");
    expect(result.stdout).toContain("chmod 600");
  });

  it("counts every offender, not just the first", async () => {
    await secret("keepsake-db.env.bak-a", 0o644);
    await secret("shipkit-www-db.env.bak-b", 0o640);
    await secret("gracefully-imagined-db.env", 0o600);
    const result = await watch({ lines: quiet });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("2 projects-db credential file(s)");
    expect(result.stdout).toContain("is 644");
    expect(result.stdout).toContain("is 640");
    expect(result.stdout).not.toContain("gracefully-imagined-db.env is");
  });

  // LAC-6096. The original pattern was `*-db.env*`, written for the per-project
  // credentials, and it matched neither of the two files named
  // projects-db-SOMETHING.env, the superuser password and the monitor's. Both
  // were sitting in the swept directory, unswept, which is the worst shape a
  // sweep can have: it reads green and the operator believes it.
  it("covers the two projects-db env files the original pattern missed", async () => {
    await secret("projects-db-superuser.env", 0o644);
    await secret("projects-db-monitor.env", 0o600);
    const result = await watch({ lines: quiet });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("projects-db-superuser.env is 644");
    expect(result.stdout).not.toContain("projects-db-monitor.env is");
  });

  // The client private key for the public-path probe (LAC-6096). libpq refuses a
  // key with group or world access outright, so a loose mode here is both a
  // leaked credential and the public-path check going blind.
  it("covers the client private key, not just the env files", async () => {
    await secret("projects-db-monitor.key", 0o644);
    const result = await watch({ lines: quiet });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("projects-db-monitor.key is 644");
    expect(result.stdout).toContain("client private key");
  });

  // Two patterns match projects-db-monitor.env. Counting it once is the whole
  // reason the loop carries a seen-list.
  it("counts a file that matches two patterns once", async () => {
    await secret("projects-db-monitor.env", 0o644);
    const result = await watch({ lines: quiet });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("1 projects-db credential file(s)");
  });

  // The public certificate is public. Demanding 600 of it would be a false alarm
  // every time someone legitimately made it readable.
  it("does not demand 600 of the public certificate", async () => {
    const crt = path.join(box.secrets, "projects-db-monitor.crt");
    await writeFile(crt, "-----BEGIN CERTIFICATE-----\n");
    await chmod(crt, 0o644);
    const result = await watch({ lines: quiet });
    expect(result.code).toBe(0);
  });

  it("leaves other people's secrets alone, because fixing those is someone else's job", async () => {
    const other = path.join(box.secrets, "ph-shopify-agent-totp.txt");
    await writeFile(other, "123456\n");
    await chmod(other, 0o644);
    const result = await watch({ lines: quiet });
    expect(result.code).toBe(0);
  });

  it("says nothing when there are no credential files at all", async () => {
    const result = await watch({ lines: quiet });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("reports a bad mode even when the tailnet is down", async () => {
    // The mode check reads the local disk, so a void auth check must not
    // swallow it. This is the case where both happen at once.
    await secret("keepsake-db.env.bak-c", 0o644);
    const result = await watch({ lines: [], sshFails: true });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("is 644");
  });
});
