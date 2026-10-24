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
  /** Point the DND channel at the fake ntfy below. Base URL, no topic. */
  ntfyUrl?: string;
  /** Configure the DND channel. Unset means the channel is not configured. */
  ntfyTopic?: string;
  /** Where the topic is read from when it is not in the environment. */
  ntfyTopicFile?: string;
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
    // Neutralised rather than inherited. ntfy.sh is a public server and a test
    // run must not be able to publish to a real topic, whatever is in the
    // ambient environment: the topic is empty unless a test sets one, the file
    // it would fall back to is a path that does not exist, and the base URL is
    // a port nothing listens on. A test that wants the channel opts in.
    FLEET_DARK_WATCH_NTFY_TOPIC: options.ntfyTopic ?? "",
    FLEET_DARK_WATCH_NTFY_TOPIC_FILE:
      options.ntfyTopicFile ?? "/proc/nonexistent/fleet-dark-watch-ntfy-topic",
    FLEET_DARK_WATCH_NTFY_URL: options.ntfyUrl ?? "http://127.0.0.1:1",
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

/**
 * A stand-in ntfy. Records the path, headers and raw body of every publish, so
 * the assertions are on the bytes a real ntfy would receive: the topic it was
 * posted to, the priority that decides whether iOS treats it as a Critical
 * Alert, and the body, which is sent raw and so has no escaping to get wrong.
 */
function fakeNtfy() {
  const received: { topic: string; title: string; priority: string; tags: string; body: string }[] =
    [];
  /** 200 is a publish ntfy accepted. Anything else is a rejected one. */
  let status = 200;
  const srv = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      received.push({
        topic: (req.url ?? "").replace(/^\//, ""),
        title: String(req.headers.title ?? ""),
        priority: String(req.headers.priority ?? ""),
        tags: String(req.headers.tags ?? ""),
        body,
      });
      if (status === 200) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"id":"nPCjvZ2Qkfmc","time":1792429138,"event":"message"}');
        return;
      }
      // A gateway error page that quotes the request URI, which is what a
      // proxy in front of ntfy actually returns and the realistic way the
      // topic gets into an error string. The redaction has to survive it.
      res.writeHead(502, { "content-type": "text/html" });
      res.end(`<html><body>502 Bad Gateway: POST ${req.url} upstream failed</body></html>`);
    });
  });
  return {
    received,
    reject() {
      status = 502;
    },
    accept() {
      status = 200;
    },
    async listen() {
      await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
      const address = srv.address();
      if (address === null || typeof address === "string") throw new Error("no port");
      return `http://127.0.0.1:${address.port}`;
    },
    async close() {
      await new Promise<void>((resolve, reject) =>
        srv.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}

/** Long and random, the way the real one is. The topic is the credential. */
const TOPIC = "fleet-dark-7xk2m9qp4vtw8nzr3hjd6fcb";

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

describe("a channel that survives Do Not Disturb (LAC-5366)", () => {
  // The switch worked. Eight pages in five days, 22h25m of real dark time,
  // every window caught. Two of those windows then ran 8h40m and 10h05m,
  // 18h45m of the 22h25m, because the page landed in Slack at 03:05 and 00:30
  // and Slack suppresses push during Do Not Disturb. Recovery both times was a
  // human plugging the laptop in. Right page, sleeping channel, ten-second fix.

  it("pages both channels on DARK, with the priority that beats DND", async () => {
    const dir = await scratch();
    const slack = fakeSlack();
    const slackApi = await slack.listen();
    const ntfy = fakeNtfy();
    const ntfyUrl = await ntfy.listen();
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);

    const result = await poll(dir, {
      now: T0 + 15 * 60,
      url: DEAD_URL,
      notify: true,
      slackApi,
      ntfyUrl,
      ntfyTopic: TOPIC,
    });

    expect(ntfy.received).toHaveLength(1);
    expect(ntfy.received[0]?.topic).toBe(TOPIC);
    // The lock-screen glance, before the phone is even picked up.
    expect(ntfy.received[0]?.title).toBe("Fleet is dark");
    // 5 is ntfy's max, and the one value the iOS app maps to a Critical Alert.
    // Anything lower and the whole change is decorative.
    expect(ntfy.received[0]?.priority).toBe("5");
    expect(ntfy.received[0]?.tags).toBe("rotating_light");
    // Byte-identical to the Slack DM. A pager that disagrees with the log is
    // worse than either channel alone, and the body is sent raw, so this also
    // proves there is no escaping layer left to get wrong.
    expect(ntfy.received[0]?.body).toBe(slack.received[0]?.text);
    expect(ntfy.received[0]?.body).toContain(
      "Fleet is dark. The control plane on zero stopped answering 15m ago"
    );
    expect(result.log).toContain("SENT slack=ok ntfy=ok");
    expect(result.state).toEqual({ down_since: String(T0), paged: "1" });

    await slack.close();
    await ntfy.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("pages both channels on RECOVERED, with the measured duration", async () => {
    const dir = await scratch();
    const slack = fakeSlack();
    const slackApi = await slack.listen();
    const ntfy = fakeNtfy();
    const ntfyUrl = await ntfy.listen();
    const darkAt = Math.floor(new Date("2026-10-19T03:36:52Z").getTime() / 1000);
    const backAt = Math.floor(new Date("2026-10-19T15:18:01Z").getTime() / 1000);
    await writeFile(path.join(dir, "state"), `down_since=${darkAt}\npaged=1\n`);

    const result = await poll(dir, {
      now: backAt + 120,
      notify: true,
      slackApi,
      ntfyUrl,
      ntfyTopic: TOPIC,
    });

    expect(ntfy.received).toHaveLength(1);
    expect(ntfy.received[0]?.title).toBe("Fleet is back");
    expect(ntfy.received[0]?.tags).toBe("white_check_mark");
    expect(ntfy.received[0]?.body).toContain("after 11h41m dark");
    expect(ntfy.received[0]?.body).toBe(slack.received[0]?.text);
    // Delivered on both, so the switch rearms for the next outage.
    expect(result.state).toBeNull();

    await slack.close();
    await ntfy.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("sends nothing to the phone for STILL-DARK, UNREACHABLE or BLIP", async () => {
    // The whole reason a Critical Alert channel is affordable. Two pushes per
    // outage. A phone that buzzes through DND every five minutes for ten hours
    // gets the app's notifications turned off, and then this change has made
    // things worse than Slack alone.
    const dir = await scratch();
    const slack = fakeSlack();
    const slackApi = await slack.listen();
    const ntfy = fakeNtfy();
    const ntfyUrl = await ntfy.listen();
    const channel = { notify: true, slackApi, ntfyUrl, ntfyTopic: TOPIC };

    // First failure: the clock starts, nobody is told.
    await poll(dir, { now: T0, url: DEAD_URL, ...channel });
    // Under the threshold.
    await poll(dir, { now: T0 + 10 * 60, url: DEAD_URL, ...channel });
    // Already paged, ten hours in. This is the one that would mute the app.
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=1\n`);
    const stillDark = await poll(dir, { now: T0 + 10 * 3600, url: DEAD_URL, ...channel });
    expect(stillDark.log).toContain("STILL-DARK");
    // A blip: down and back inside the threshold, never paged.
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);
    const blip = await poll(dir, { now: T0 + 6 * 60, ...channel });
    expect(blip.log).toContain("BLIP");

    expect(ntfy.received).toHaveLength(0);
    expect(slack.received).toHaveLength(0);

    await slack.close();
    await ntfy.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("does not touch the phone on a dry run", async () => {
    const dir = await scratch();
    const ntfy = fakeNtfy();
    const ntfyUrl = await ntfy.listen();
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);

    const result = await poll(dir, { now: T0 + 15 * 60, url: DEAD_URL, ntfyUrl, ntfyTopic: TOPIC });

    expect(result.stdout).toContain("Fleet is dark");
    expect(ntfy.received).toHaveLength(0);
    await ntfy.close();
    await rm(dir, { recursive: true, force: true });
  });
});

describe("one channel down is still a delivered page (LAC-5366)", () => {
  // The callers read `notify`'s return value to decide whether the page has
  // been spent. At least one channel accepting is the only workable rule.
  // Requiring both would re-buzz the phone every five minutes for the whole
  // outage whenever Slack is the broken half, which is the muted-channel
  // failure this file keeps trying not to cause. Requiring neither would mark
  // a page delivered that nobody received.

  it("counts the page as delivered when only the phone got it", async () => {
    const dir = await scratch();
    const slack = fakeSlack();
    const slackApi = await slack.listen();
    const ntfy = fakeNtfy();
    const ntfyUrl = await ntfy.listen();
    slack.reject();
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);

    const result = await poll(dir, {
      now: T0 + 15 * 60,
      url: DEAD_URL,
      notify: true,
      slackApi,
      ntfyUrl,
      ntfyTopic: TOPIC,
    });

    expect(ntfy.received).toHaveLength(1);
    // Recorded, so the phone is not buzzed again five minutes from now.
    expect(result.state).toEqual({ down_since: String(T0), paged: "1" });
    // And the log is the only place the half-failure is visible, because the
    // delivered half handed the caller a success and the cron line throws
    // stderr away.
    expect(result.log).toContain("SENT slack=failed ntfy=ok");

    await slack.close();
    await ntfy.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("counts the page as delivered when only Slack got it", async () => {
    const dir = await scratch();
    const slack = fakeSlack();
    const slackApi = await slack.listen();
    const ntfy = fakeNtfy();
    const ntfyUrl = await ntfy.listen();
    ntfy.reject();
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);

    const result = await poll(dir, {
      now: T0 + 15 * 60,
      url: DEAD_URL,
      notify: true,
      slackApi,
      ntfyUrl,
      ntfyTopic: TOPIC,
    });

    expect(slack.received).toHaveLength(1);
    expect(result.state).toEqual({ down_since: String(T0), paged: "1" });
    expect(result.log).toContain("SENT slack=ok ntfy=failed");

    await slack.close();
    await ntfy.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("retries when neither channel took it, rather than spending the page", async () => {
    const dir = await scratch();
    const slack = fakeSlack();
    const slackApi = await slack.listen();
    const ntfy = fakeNtfy();
    const ntfyUrl = await ntfy.listen();
    slack.reject();
    ntfy.reject();
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);
    const channel = { url: DEAD_URL, notify: true, slackApi, ntfyUrl, ntfyTopic: TOPIC };

    const failed = await poll(dir, { now: T0 + 15 * 60, ...channel });
    expect(failed.log).toContain("not delivered on any channel (slack=failed ntfy=failed)");
    // Not recorded, so the outage is still owed its page.
    expect(failed.state).toEqual({ down_since: String(T0), paged: "0" });

    slack.accept();
    ntfy.accept();
    const retried = await poll(dir, { now: T0 + 20 * 60, ...channel });
    // Two attempts each: the fakes record what they were sent before deciding
    // to reject it, so the first, refused page is in there too. The page the
    // outage was owed is the second one, and this time it stuck.
    expect(slack.received).toHaveLength(2);
    expect(ntfy.received).toHaveLength(2);
    expect(ntfy.received.at(-1)?.body).toContain("stopped answering 20m ago");
    expect(retried.state).toEqual({ down_since: String(T0), paged: "1" });

    await slack.close();
    await ntfy.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("pages Slack and says it is degraded when no topic is configured", async () => {
    // The failure this channel could have had: silently off, discovered six
    // hours into the next overnight outage. Reported the same way a fallback
    // state dir is, on the line the healthy path already writes every poll.
    const dir = await scratch();
    const slack = fakeSlack();
    const slackApi = await slack.listen();

    // Healthy first, with no state on disk: the degraded note rides on the OK
    // line, which is the line this script writes 288 times a day, so a channel
    // that is quietly off is visible without waiting for an outage.
    const healthy = await poll(dir, { now: T0 });
    expect(healthy.log).toContain("degraded: no ntfy topic in");
    expect(healthy.log).toContain("will not survive Do Not Disturb");

    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);
    const paged = await poll(dir, { now: T0 + 15 * 60, url: DEAD_URL, notify: true, slackApi });
    // Slack is still a channel, so the page still goes out and still counts.
    expect(slack.received).toHaveLength(1);
    expect(paged.state).toEqual({ down_since: String(T0), paged: "1" });
    expect(paged.log).toContain("SENT slack=ok ntfy=failed");

    await slack.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("reads the topic from a file so the cron line can stay clean", async () => {
    // Same arrangement as the Slack token, and for the same reason: Unraid
    // regenerates root's crontab onto /boot, which is FAT32 and carries no
    // permission bits at all, so a secret inlined there is readable by anything
    // that can see the flash.
    const dir = await scratch();
    const ntfy = fakeNtfy();
    const ntfyUrl = await ntfy.listen();
    const slack = fakeSlack();
    const slackApi = await slack.listen();
    const topicFile = path.join(dir, "ntfy-topic");
    await writeFile(topicFile, `${TOPIC}\n`, { mode: 0o600 });
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);

    const result = await poll(dir, {
      now: T0 + 15 * 60,
      url: DEAD_URL,
      notify: true,
      slackApi,
      ntfyUrl,
      ntfyTopicFile: topicFile,
    });

    expect(ntfy.received).toHaveLength(1);
    // Trailing newline stripped, or the publish would 404 on a topic that has
    // one character too many.
    expect(ntfy.received[0]?.topic).toBe(TOPIC);
    expect(result.log).toContain("SENT slack=ok ntfy=ok");

    await slack.close();
    await ntfy.close();
    await rm(dir, { recursive: true, force: true });
  });
});

describe("the topic is a credential (LAC-5366)", () => {
  // A public ntfy topic is world-readable and world-writable by anyone who
  // knows the name, so the name is the secret. It lives in a 600 file and it
  // must not leak into the log, which is world-readable on the flash, or into
  // /tmp/fleet-dark-watch.err, which the cron line appends stderr to forever.

  it("keeps the topic out of the log on a delivered page", async () => {
    const dir = await scratch();
    const slack = fakeSlack();
    const slackApi = await slack.listen();
    const ntfy = fakeNtfy();
    const ntfyUrl = await ntfy.listen();
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);

    const result = await poll(dir, {
      now: T0 + 15 * 60,
      url: DEAD_URL,
      notify: true,
      slackApi,
      ntfyUrl,
      ntfyTopic: TOPIC,
    });

    expect(ntfy.received).toHaveLength(1);
    expect(result.log).not.toContain(TOPIC);
    expect(result.stdout).not.toContain(TOPIC);
    expect(result.stderr).not.toContain(TOPIC);

    await slack.close();
    await ntfy.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps the topic out of stderr when ntfy rejects the publish", async () => {
    // The branch that actually leaks. curl puts the URL it failed on into
    // several of its own error strings, and the URL is the secret, so the
    // failure path is the one that has to be scrubbed.
    const dir = await scratch();
    const slack = fakeSlack();
    const slackApi = await slack.listen();
    const ntfy = fakeNtfy();
    const ntfyUrl = await ntfy.listen();
    ntfy.reject();
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);

    const result = await poll(dir, {
      now: T0 + 15 * 60,
      url: DEAD_URL,
      notify: true,
      slackApi,
      ntfyUrl,
      ntfyTopic: TOPIC,
    });

    expect(result.stderr).toContain("ntfy rejected the message");
    expect(result.stderr).toContain("<topic>");
    expect(result.stderr).not.toContain(TOPIC);
    expect(result.log).not.toContain(TOPIC);

    await slack.close();
    await ntfy.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps the topic out of stderr when the whole host is unreachable", async () => {
    // A dead port is curl exit 7, and its message is the one that carries a
    // host and port. Belt and braces on the redaction, since this is the shape
    // the real failure will take if ntfy.sh ever goes down.
    const dir = await scratch();
    const slack = fakeSlack();
    const slackApi = await slack.listen();
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);

    const result = await poll(dir, {
      now: T0 + 15 * 60,
      url: DEAD_URL,
      notify: true,
      slackApi,
      // The harness default is a port nothing listens on.
      ntfyTopic: TOPIC,
    });

    expect(result.stderr).toContain("ntfy rejected the message");
    expect(result.stderr).not.toContain(TOPIC);
    expect(result.log).not.toContain(TOPIC);

    await slack.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("sends the message body on stdin, so no message can open a file", async () => {
    // `--data-binary "$text"` reads a *file* when its argument starts with
    // `@`, and a pager message is not a thing that should be able to open
    // files. `@-` takes the body from stdin instead, which also leaves the
    // payload with no escaping layer at all.
    const script = await readFile(SCRIPT, "utf8");
    const body = script.slice(script.indexOf("notify_ntfy() {"), script.indexOf("# Both channels"));
    expect(body).toContain("--data-binary @-");
    expect(body).not.toMatch(/--data(-binary)? "\$text"/);
  });

  it("builds both notifiers without jq, because jq is one of the missing things it reports", async () => {
    // Widened for the second channel. jq is required to read the health body
    // and must not be required to raise the alarm: "jq is missing" is one of
    // the things this script has to be able to say, and a notifier that needs
    // the missing tool to report the missing tool reports nothing.
    const script = await readFile(SCRIPT, "utf8");
    const notifiers = script.slice(
      script.indexOf("notify_slack() {"),
      script.indexOf("cannot_look()")
    );
    expect(notifiers).not.toContain("jq");
  });
});

describe("the BLIP line said something impossible (LAC-5366)", () => {
  // Shipped: "BLIP plane was unreachable for 15m and recovered before the 15m
  // threshold" (2026-10-23T20:10:01). Fifteen minutes is not before fifteen
  // minutes. Cosmetic, except it is the line a person reads at 3am.
  //
  // Neither number was wrong. They are measured at different moments. The page
  // is decided at a *failing* poll; this duration runs to the recovery, which
  // is up to one cron interval later. So a 15m outage that comes back on the
  // next poll genuinely was dark for 15m and genuinely was never paged. What
  // it beat was the next failing poll, not the threshold.

  it("does not claim a 15m outage recovered before the 15m threshold", async () => {
    const dir = await scratch();
    // The real sequence: clock started at 19:55:01, 20:05 saw 10m and held,
    // 20:10:01 found it back. Exactly 900 seconds, never paged.
    await writeFile(path.join(dir, "state"), `down_since=${T0}\npaged=0\n`);
    const result = await poll(dir, { now: T0 + 15 * 60 });

    expect(result.code).toBe(0);
    expect(result.log).toContain("BLIP plane was unreachable for 15m");
    expect(result.log).not.toContain("recovered before the 15m threshold");
    expect(result.log).toContain("before any poll caught it past the 15m threshold");
    expect(result.log).toContain("so nobody was paged");
    // Still only a log line. A recovery message for a blip teaches Lacy to
    // ignore the next real one.
    expect(result.stdout).not.toContain("Fleet is back");
    expect(result.state).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });
});
