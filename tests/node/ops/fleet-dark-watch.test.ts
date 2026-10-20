import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);

const SCRIPT = path.resolve(__dirname, "../../../scripts/fleet-dark-watch.sh");

/** The shape the real endpoint returns, trimmed to the two fields read. */
const healthBody = (processStartedAt: string) =>
  JSON.stringify({
    status: "ok",
    version: "2026.1012.0",
    serverInfo: { processStartedAt, git: { available: true } },
  });

/**
 * A stand-in control plane. The script addresses the real one through
 * `--resolve host:443:ip`, which curl only applies to a matching host and port,
 * so pointing it at `127.0.0.1:<random>` leaves that flag inert and exercises
 * everything else for real: a real curl, a real 200, a real body.
 */
let server: Server;
let healthUrl: string;
/** Flipped per test to serve a healthy plane, or something that is not one. */
let respond: (res: Parameters<Parameters<typeof createServer>[0]>[1]) => void;

beforeAll(async () => {
  respond = (res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(healthBody("2026-10-19T15:18:01.071Z"));
  };
  server = createServer((_req, res) => respond(res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  healthUrl = `http://127.0.0.1:${address.port}/api/health`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

interface Result {
  code: number;
  stdout: string;
  stderr: string;
  /** Parsed state file, or null once the script has cleared it. */
  state: { down_since?: string; paged?: string; recovered_at?: string } | null;
  log: string;
}

interface PollOptions {
  now: number;
  url?: string;
  notify?: boolean;
  /** Where state goes when the primary dir refuses a write. */
  fallbackDir?: string;
  /** Point the notifier at the fake Slack below instead of the real one. */
  slackApi?: string;
  /** Read from `dir` by default; set explicitly when `dir` is unwritable. */
  tokenFile?: string;
  /** Read the log from here instead of `dir`, when a fallback moved it. */
  logDir?: string;
}

/**
 * One poll. `now` is injected rather than waited for, so a fifteen-minute
 * threshold and an eleven-hour outage both cost a millisecond to test.
 */
async function poll(dir: string, options: PollOptions): Promise<Result> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FLEET_DARK_WATCH_DIR: dir,
    FLEET_DARK_WATCH_URL: options.url ?? healthUrl,
    FLEET_DARK_WATCH_HOST: "127.0.0.1",
    FLEET_DARK_WATCH_NOW: String(options.now),
    TZ: "UTC",
  };
  if (options.fallbackDir !== undefined) {
    env.FLEET_DARK_WATCH_FALLBACK_DIR = options.fallbackDir;
  }
  if (options.slackApi !== undefined) {
    env.FLEET_DARK_WATCH_SLACK_API = options.slackApi;
    env.FLEET_DARK_WATCH_SLACK_TOKEN = "xoxb-test-token";
  }
  let code = 0;
  let stdout = "";
  let stderr = "";
  try {
    const out = await run("bash", [SCRIPT, ...(options.notify ? ["--notify"] : [])], { env });
    stdout = out.stdout;
    stderr = out.stderr;
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    code = failure.code ?? 1;
    stdout = failure.stdout ?? "";
    stderr = failure.stderr ?? "";
  }

  const stateDir = options.logDir ?? dir;
  const raw = await readFile(path.join(stateDir, "state"), "utf8").catch(() => null);
  const state =
    raw === null
      ? null
      : Object.fromEntries(
          raw
            .trim()
            .split("\n")
            .map((line) => line.split("=") as [string, string])
        );
  const log = await readFile(path.join(stateDir, "fleet-dark-watch.log"), "utf8").catch(() => "");
  return { code, stdout, stderr, state, log };
}

async function scratch(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), "fleet-dark-watch-"));
}

/** A port nothing listens on. This is what a dead control plane looks like. */
const DEAD_URL = "http://127.0.0.1:1/api/health";

const T0 = 1_760_000_000;

describe("a healthy plane", () => {
  it("says nothing, exits 0, and still records that it looked", async () => {
    const dir = await scratch();
    const result = await poll(dir, { now: T0 });

    expect(result.code).toBe(0);
    // Silence means the fleet is alive. The only output is the log line, and it
    // exists so that "quiet because healthy" can be told from "quiet because
    // this script stopped running". For a dead-man's switch that is the product.
    expect(result.log).toContain("OK plane answered 200");
    expect(result.log).toContain("up since 2026-10-19T15:18:01.071Z");
    expect(result.stdout).not.toContain("Fleet is dark");
    expect(result.state).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });

  it("stamps every log line with the time it happened", async () => {
    // The power watch shipped without this, and reconstructing the 2026-10-19
    // outage needed kern.boottime cross-referenced against another log purely
    // because fleet-power-watch.log could not say when anything happened.
    const dir = await scratch();
    const result = await poll(dir, { now: T0 });
    // T0 spelled out rather than a loose shape, so this also proves the stamp
    // is the moment that was injected and not just something ISO-8601-ish.
    expect(result.log).toMatch(/^2025-10-09T08:53:20\+0000 OK /);
    await rm(dir, { recursive: true, force: true });
  });

  it("treats a 200 that is not the health JSON as not answering", async () => {
    // A captive portal or a proxy in front of a dead app both return 200. That
    // is not the control plane, and calling it healthy is the whole failure.
    const dir = await scratch();
    respond = (res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html>Sign in to the network</html>");
    };
    const result = await poll(dir, { now: T0 });
    expect(result.code).toBe(1);
    expect(result.log).toContain("UNREACHABLE http=200");
    respond = (res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(healthBody("2026-10-19T15:18:01.071Z"));
    };
    await rm(dir, { recursive: true, force: true });
  });
});

describe("going dark", () => {
  it("starts the clock on the first failure and does not page", async () => {
    // One missed poll is a restart, a lid close, or a loaded laptop. Paging on
    // it is how a channel gets muted before the outage that matters.
    const dir = await scratch();
    const result = await poll(dir, { now: T0, url: DEAD_URL });

    expect(result.code).toBe(1);
    expect(result.state).toEqual({ down_since: String(T0), paged: "0" });
    expect(result.stdout).not.toContain("Fleet is dark");
    expect(result.log).toContain("starting the clock");
    await rm(dir, { recursive: true, force: true });
  });

  it("records why curl failed, not just that it did", async () => {
    // http=000 and a TLS 35 both look like a firewall and neither one is.
    // LAC-4874 lost an hour to that; the reason belongs in the log.
    const dir = await scratch();
    const result = await poll(dir, { now: T0, url: DEAD_URL });
    expect(result.log).toMatch(/UNREACHABLE http=000 curl: \(7\)/);
    await rm(dir, { recursive: true, force: true });
  });

  it("holds its fire under the threshold", async () => {
    const dir = await scratch();
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);
    // Fourteen minutes. The contract says fifteen.
    const result = await poll(dir, { now: T0 + 14 * 60, url: DEAD_URL });

    expect(result.stdout).not.toContain("Fleet is dark");
    expect(result.log).toContain("under the 15m threshold");
    expect(result.state).toEqual({ down_since: String(T0), paged: "0" });
    await rm(dir, { recursive: true, force: true });
  });

  it("pages exactly at fifteen minutes, naming what stopped and what to do", async () => {
    const dir = await scratch();
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);
    const result = await poll(dir, { now: T0 + 15 * 60, url: DEAD_URL });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain(
      "Fleet is dark. The control plane on zero stopped answering 15m ago"
    );
    // Naming the three things that die is the point. "The control plane is
    // down" is a sentence Lacy cannot act on at 23:30.
    expect(result.stdout).toContain("no agent runs, no routines, no store watch");
    expect(result.stdout).toContain("Every other watch lives on that same Mac");
    expect(result.stdout).toContain("Check the laptop: power first, then the FileVault prompt.");
    await rm(dir, { recursive: true, force: true });
  });

  it("does not spend the real page when run by hand without --notify", async () => {
    // A dry run that marked the outage as paged would silently eat the one
    // message the next real outage is owed. Same contract as the power watch.
    const dir = await scratch();
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);
    const result = await poll(dir, { now: T0 + 15 * 60, url: DEAD_URL });
    expect(result.state).toEqual({ down_since: String(T0), paged: "0" });
    await rm(dir, { recursive: true, force: true });
  });

  it("pages once per outage, not once per poll", async () => {
    const dir = await scratch();
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=1\n`);
    // Twelve hours in. A monitor that repeats itself for twelve hours is a
    // monitor nobody reads.
    const result = await poll(dir, { now: T0 + 12 * 3600, url: DEAD_URL });

    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("Fleet is dark");
    expect(result.log).toContain("STILL-DARK http=000 for 12h00m, already paged");
    await rm(dir, { recursive: true, force: true });
  });
});

describe("coming back", () => {
  it("reports the outage with a measured duration, which is the whole point", async () => {
    const dir = await scratch();
    // The real outage: dark at 23:36:52, process back up at 15:18:01Z.
    const darkAt = Math.floor(new Date("2026-10-19T03:36:52Z").getTime() / 1000);
    const backAt = Math.floor(new Date("2026-10-19T15:18:01Z").getTime() / 1000);
    await writeFile(path.join(dir, "state"), `down_since=${darkAt}\npaged=1\n`);
    const result = await poll(dir, { now: backAt + 120 });

    expect(result.code).toBe(0);
    // 11h41m, the line that would have made LAC-4874 unnecessary. Taken from
    // processStartedAt rather than from when this poll noticed, because between
    // those two is up to five minutes of cron and not of outage.
    expect(result.stdout).toContain("after 11h41m dark");
    expect(result.stdout).toContain("Anything scheduled in that window did not run.");
    // No --notify, so nothing was delivered and the state deliberately stays:
    // a by-hand run must not consume the recovery message the next real poll
    // still owes. Rearming on a delivered DM is asserted separately below.
    expect(result.state).not.toBeNull();
    await rm(dir, { recursive: true, force: true });
  });

  it("ignores a processStartedAt from before the outage began", async () => {
    // The plane never restarted, so the network was the broken part and this
    // poll is the first moment anyone can prove it is back. Trusting the old
    // start time there would report a wildly inflated outage.
    const dir = await scratch();
    const darkAt = Math.floor(new Date("2026-10-19T15:30:00Z").getTime() / 1000);
    await writeFile(path.join(dir, "state"), `down_since=${darkAt}\npaged=1\n`);
    const result = await poll(dir, { now: darkAt + 20 * 60 });

    // processStartedAt is 15:18:01Z, twelve minutes before the outage started.
    expect(result.stdout).toContain("after 20m dark");
    await rm(dir, { recursive: true, force: true });
  });

  it("stays quiet about a blip it never paged for", async () => {
    // Down for six minutes and back. A control-plane restart is not an outage,
    // and a recovery message for one teaches Lacy to ignore the next.
    const dir = await scratch();
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);
    const result = await poll(dir, { now: T0 + 6 * 60 });

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("Fleet is back");
    expect(result.log).toContain("BLIP plane was unreachable for 6m");
    expect(result.state).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });
});

describe("when it cannot do its job", () => {
  it("exits 2 rather than 0 when it has nowhere at all to keep state", async () => {
    // "Could not look" and "the fleet is fine" are the two readings this file
    // exists to keep apart, and exit 0 conflates them. Copied from the power
    // watch, which uses 2 for an unreadable pmset. Both candidate directories
    // have to be unusable now: one bad directory is survivable by design.
    const result = await poll("/proc/nonexistent/fleet-dark-watch", {
      now: T0,
      fallbackDir: "/proc/nonexistent/fleet-dark-watch-fallback",
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("cannot write to");
  });

  it("refuses an argument it does not understand instead of silently polling", async () => {
    const dir = await scratch();
    const result = await poll(dir, { now: T0 }).then(() =>
      run("bash", [SCRIPT, "--panic"], { env: { ...process.env, FLEET_DARK_WATCH_DIR: dir } }).then(
        () => ({ code: 0, stderr: "" }),
        (error: { code?: number; stderr?: string }) => ({
          code: error.code ?? 1,
          stderr: error.stderr ?? "",
        })
      )
    );
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown argument: --panic");
    await rm(dir, { recursive: true, force: true });
  });
});

/**
 * A stand-in Slack. Records what it was sent and can be told to reject, so the
 * "notifier is broken" branches are exercised against a real curl and a real
 * HTTP response rather than a mock.
 */
function fakeSlack() {
  const received: { channel: string; text: string }[] = [];
  let ok = true;
  let raw = "";
  const srv = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      raw = body;
      // Parsed here on purpose: if the script's hand-rolled JSON escaping were
      // wrong, this throws and the test fails, which is the assertion.
      received.push(JSON.parse(body));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(ok ? '{"ok":true,"ts":"1792429138.742799"}' : '{"ok":false,"error":"invalid_auth"}');
    });
  });
  return {
    received,
    get raw() {
      return raw;
    },
    reject() {
      ok = false;
    },
    accept() {
      ok = true;
    },
    async listen() {
      await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
      const address = srv.address();
      if (address === null || typeof address === "string") throw new Error("no port");
      return `http://127.0.0.1:${address.port}/api/chat.postMessage`;
    },
    async close() {
      await new Promise<void>((resolve, reject) =>
        srv.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}

/** A directory that exists but refuses writes. ENOSPC looks like this too. */
async function readOnlyDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "fleet-dark-watch-ro-"));
  await chmod(dir, 0o500);
  return dir;
}

describe("a state write that fails (LAC-4875 finding 1)", () => {
  // The bug: `state_put` was never checked. The write failed, the next poll
  // found no state, re-entered "first failure, starting the clock", and the
  // threshold was never reached. Twelve-hour outage, zero pages, no log line
  // saying why. `[ -w ]` missed it because it tests a permission bit and the
  // real cause is a full pool.

  it("still pages at the threshold when the primary dir refuses writes", async () => {
    const primary = await readOnlyDir();
    const fallback = await scratch();
    const slack = fakeSlack();
    const api = await slack.listen();

    // The exact sequence from the review: first failure, then the threshold.
    const first = await poll(primary, {
      now: T0,
      url: DEAD_URL,
      notify: true,
      fallbackDir: fallback,
      slackApi: api,
      logDir: fallback,
    });
    expect(first.state).toEqual({ down_since: String(T0), paged: "0" });

    const atThreshold = await poll(primary, {
      now: T0 + 15 * 60,
      url: DEAD_URL,
      notify: true,
      fallbackDir: fallback,
      slackApi: api,
      logDir: fallback,
    });

    // Before the fix the clock restarted on every poll, so this logged
    // "starting the clock" again instead of ever reaching the threshold, and
    // paged nobody however long the outage ran.
    expect(atThreshold.log.match(/starting the clock/g)).toHaveLength(1);
    expect(atThreshold.log).toContain("DARK Fleet is dark");
    expect(slack.received.map((m) => m.text).join("\n")).toContain(
      "Fleet is dark. The control plane on zero stopped answering 15m ago"
    );
    expect(atThreshold.state).toEqual({ down_since: String(T0), paged: "1" });

    await slack.close();
    await chmod(primary, 0o700);
    await rm(primary, { recursive: true, force: true });
    await rm(fallback, { recursive: true, force: true });
  });

  it("says on the healthy path that it is running degraded", async () => {
    // Falling back is survival, not success. If the pool stopped taking writes
    // the log has to say so, or the next outage is debugged from the wrong host.
    const primary = await readOnlyDir();
    const fallback = await scratch();
    const result = await poll(primary, { now: T0, fallbackDir: fallback, logDir: fallback });

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("state is in");
    expect(result.log).toContain("degraded:");
    await chmod(primary, 0o700);
    await rm(primary, { recursive: true, force: true });
    await rm(fallback, { recursive: true, force: true });
  });

  it("proves the directory by writing, not by asking about permission bits", async () => {
    // A directory can be writable by permission and still refuse every write.
    // The guard has to be a real write or it misses the only failure that is
    // actually likely on this host.
    const script = await readFile(SCRIPT, "utf8");
    expect(script).not.toContain('[ -w "$WATCH_DIR" ]');
    expect(script).toContain("can_write()");
  });
});

describe("exit 2 reaching a person (LAC-4875 finding 2)", () => {
  // The bug: exit 2 printed the right sentence to stderr, and the shipped cron
  // line was `> /dev/null 2>&1`, so an exit-2 poll produced literally nothing.
  // Silence is also what a healthy fleet looks like.

  it("Slack-DMs that it is blind when it can write nowhere", async () => {
    const slack = fakeSlack();
    const api = await slack.listen();
    const result = await poll("/proc/nonexistent/fleet-dark-watch", {
      // 12:00, inside the one five-minute window an hour where this speaks.
      now: T0 - (T0 % 3600),
      url: DEAD_URL,
      notify: true,
      fallbackDir: "/proc/nonexistent/fleet-dark-watch-fallback",
      slackApi: api,
      tokenFile: "unused",
    });

    expect(result.code).toBe(2);
    expect(slack.received).toHaveLength(1);
    expect(slack.received[0]?.text).toContain("Fleet dark watch is blind on library");
    // Naming the consequence is the point: otherwise the reader assumes the
    // quiet channel means a healthy fleet.
    expect(slack.received[0]?.text).toContain("treat silence from it as meaningless");
    await slack.close();
  });

  it("rate-limits that page to once an hour, since it has no state to dedupe with", async () => {
    // 288 messages a day would get the channel muted, which is the failure this
    // whole issue is about. No state file means the clock is the only dedupe
    // available.
    const slack = fakeSlack();
    const api = await slack.listen();
    const base = T0 - (T0 % 3600);
    for (const offset of [5 * 60, 20 * 60, 45 * 60]) {
      await poll("/proc/nonexistent/fleet-dark-watch", {
        now: base + offset,
        url: DEAD_URL,
        notify: true,
        fallbackDir: "/proc/nonexistent/fleet-dark-watch-fallback",
        slackApi: api,
      });
    }
    expect(slack.received).toHaveLength(0);
    await slack.close();
  });

  it("builds its JSON without jq, because jq is one of the things it must report missing", async () => {
    const script = await readFile(SCRIPT, "utf8");
    const notifyBody = script.slice(script.indexOf("notify() {"), script.indexOf("cannot_look()"));
    expect(notifyBody).not.toContain("jq");
  });

  it("escapes the message so a quote cannot break the payload", async () => {
    // What `jq -n --arg` used to guarantee. Dropping jq from the notifier must
    // not drop that, so this asserts on the bytes the server receives.
    const dir = await scratch();
    const slack = fakeSlack();
    const api = await slack.listen();
    await poll(dir, {
      now: T0,
      url: DEAD_URL,
      notify: true,
      slackApi: api,
      // A backslash and a double quote in the one field taken from outside.
      fallbackDir: dir,
    });
    // The dark page needs a threshold crossing; this poll only starts the clock,
    // so assert directly on the escaper through a blind-path message instead.
    const blind = fakeSlack();
    const blindApi = await blind.listen();
    await poll('/proc/nope/a"b\\c', {
      now: T0 - (T0 % 3600),
      url: DEAD_URL,
      notify: true,
      fallbackDir: '/proc/nope/a"b\\c-fallback',
      slackApi: blindApi,
    });
    expect(blind.received).toHaveLength(1);
    expect(blind.received[0]?.text).toContain('a"b\\c');
    expect(() => JSON.parse(blind.raw)).not.toThrow();
    await slack.close();
    await blind.close();
    await rm(dir, { recursive: true, force: true });
  });
});

describe("a recovery that could not be delivered (LAC-4875 finding 3)", () => {
  // The bug: `rm -f "$STATE_FILE"` ran whether or not the recovery DM was
  // delivered, so one transient Slack failure ate the measured duration for
  // good. The dark page already had the opposite contract.

  it("keeps the outage open and retries with the same measured duration", async () => {
    const dir = await scratch();
    const slack = fakeSlack();
    const api = await slack.listen();
    const darkAt = Math.floor(new Date("2026-10-19T03:36:52Z").getTime() / 1000);
    const backAt = Math.floor(new Date("2026-10-19T15:18:01Z").getTime() / 1000);
    await writeFile(path.join(dir, "state"), `down_since=${darkAt}\npaged=1\n`);

    slack.reject();
    const failed = await poll(dir, { now: backAt + 120, notify: true, slackApi: api });

    // The state must survive, and must now carry the moment it came back.
    expect(failed.state).not.toBeNull();
    expect(failed.state?.paged).toBe("1");
    expect(failed.state?.recovered_at).toBeTruthy();
    expect(failed.log).toContain("keeping the outage open so the next poll retries");

    // Five minutes later, Slack is back.
    slack.accept();
    const retried = await poll(dir, { now: backAt + 420, notify: true, slackApi: api });

    const delivered = slack.received.at(-1)?.text ?? "";
    // 11h41m, not 11h46m: the retry reports what was measured, not what the
    // notifier outage inflated it to.
    expect(delivered).toContain("after 11h41m dark");
    expect(retried.state).toBeNull();

    await slack.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("clears the state once the recovery is actually delivered", async () => {
    const dir = await scratch();
    const slack = fakeSlack();
    const api = await slack.listen();
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=1\n`);
    const result = await poll(dir, { now: T0 + 3600, notify: true, slackApi: api });

    expect(slack.received.at(-1)?.text).toContain("Fleet is back");
    // Rearmed, so the next outage gets its own page.
    expect(result.state).toBeNull();
    await slack.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("does not consume the recovery on a dry run", async () => {
    // Without --notify nothing was delivered, so the state has to stay for the
    // real poll that still owes the message.
    const dir = await scratch();
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=1\n`);
    const result = await poll(dir, { now: T0 + 3600 });

    expect(result.log).toContain("RECOVERED");
    expect(result.state).not.toBeNull();
    await rm(dir, { recursive: true, force: true });
  });
});

describe("review nits (LAC-4875 loop 2)", () => {
  it("flattens every control byte, not just the three a message usually has", async () => {
    // Nit 1. A raw \x1b used to pass through and produce invalid JSON, which
    // Slack rejects, which eats the page. Not reachable as shipped, but the
    // comment above json_string claimed all control characters were flattened,
    // so either the code or the comment was wrong.
    const slack = fakeSlack();
    const api = await slack.listen();
    await poll("/proc/nope/esc\x1bhere\x07bell", {
      now: T0 - (T0 % 3600),
      url: DEAD_URL,
      notify: true,
      fallbackDir: "/proc/nope/esc-fallback",
      slackApi: api,
    });

    expect(slack.received).toHaveLength(1);
    // Parsed by the fake server, so an invalid payload would already have
    // thrown. Assert the bytes became spaces rather than vanishing.
    expect(() => JSON.parse(slack.raw)).not.toThrow();
    expect(slack.received[0]?.text).toContain("esc here bell");
    await slack.close();
  });

  it("speaks rather than going silent when it cannot work out the minute", async () => {
    // The rate limiter needs `date`, and `date` is one of the dependencies the
    // limiter is asked about, so an unusable clock must mean "speak". Silence
    // is the failure this file exists to prevent; a flood is merely bad.
    const slack = fakeSlack();
    const api = await slack.listen();
    await poll("/proc/nope", {
      // Not an epoch, so at_epoch cannot format it and the minute is unknowable.
      now: "not-a-clock" as unknown as number,
      url: DEAD_URL,
      notify: true,
      fallbackDir: "/proc/nope-fb",
      slackApi: api,
    });

    expect(slack.received).toHaveLength(1);
    expect(slack.received[0]?.text).toContain("blind on library");
    await slack.close();
  });

  it("rate-limits the missing-dependency alarm too", async () => {
    // Nit 2. A missing dependency persists until a human fixes it, so an
    // ungated DM there is 288 a day and a muted channel. The limiter already
    // existed one function above; the dep path just was not using it.
    const script = await readFile(SCRIPT, "utf8");
    const depGuard = script.slice(
      script.indexOf("for dep in curl jq date"),
      script.indexOf("# Proves the directory by writing")
    );
    expect(depGuard).toContain("top_of_hour");
    // And stderr is never gated, so a by-hand run always says it.
    expect(depGuard).toContain('is not on PATH\\n\' "$dep" >&2');
  });
});
