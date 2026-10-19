import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  state: { down_since?: string; paged?: string } | null;
  log: string;
}

/**
 * One poll. `now` is injected rather than waited for, so a fifteen-minute
 * threshold and an eleven-hour outage both cost a millisecond to test.
 */
async function poll(
  dir: string,
  options: { now: number; url?: string; notify?: boolean }
): Promise<Result> {
  const env = {
    ...process.env,
    FLEET_DARK_WATCH_DIR: dir,
    FLEET_DARK_WATCH_URL: options.url ?? healthUrl,
    FLEET_DARK_WATCH_HOST: "127.0.0.1",
    FLEET_DARK_WATCH_NOW: String(options.now),
    TZ: "UTC",
  };
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

  const raw = await readFile(path.join(dir, "state"), "utf8").catch(() => null);
  const state =
    raw === null
      ? null
      : Object.fromEntries(
          raw
            .trim()
            .split("\n")
            .map((line) => line.split("=") as [string, string])
        );
  const log = await readFile(path.join(dir, "fleet-dark-watch.log"), "utf8").catch(() => "");
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
    // Rearmed, so the next outage gets its own page.
    expect(result.state).toBeNull();
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
  it("exits 2 rather than 0 when it has nowhere to keep state", async () => {
    // "Could not look" and "the fleet is fine" are the two readings this file
    // exists to keep apart, and exit 0 conflates them. Copied from the power
    // watch, which uses 2 for an unreadable pmset.
    const result = await poll("/proc/nonexistent/fleet-dark-watch", { now: T0 });
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
