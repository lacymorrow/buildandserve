import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

const SCRIPT = path.resolve(__dirname, "../../../scripts/tailscale-watchdog.sh");

/**
 * A stand-in for the two things the watchdog probes: zero's control plane over
 * the tailnet, and a host on the public internet. Both are real HTTP through a
 * real curl, because the probes being real requests rather than name lookups is
 * the whole design (a name lookup can be served from cache and fail open).
 *
 * Health is a function rather than a flag so a test can make the plane come
 * back *because* the fake `tailscale up` ran, which is the behaviour under test
 * rather than something simulated around it.
 */
let server: Server;
let origin: string;
let planeHealthy: () => boolean;
let publicHealthy: () => boolean;
/** Everything the fake Slack was asked to post, newest last. */
let slackPosts: string[];

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "";
    if (url.startsWith("/plane")) {
      if (!planeHealthy()) {
        res.writeHead(503).end("no");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", version: "2026.1012.0" }));
      return;
    }
    if (url.startsWith("/public")) {
      res.writeHead(publicHealthy() ? 200 : 503).end("{}");
      return;
    }
    if (url.startsWith("/slack")) {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        slackPosts.push(body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

/** One sandbox per test: the fake binaries, the state dir, and the call log. */
interface Box {
  dir: string;
  state: string;
  bin: string;
  calls: string;
}

let box: Box;

async function bin(box: Box, name: string, body: string) {
  const file = path.join(box.bin, name);
  await writeFile(file, `#!/bin/sh\nprintf '%s\\n' "${name} $*" >> "${box.calls}"\n${body}\n`);
  await chmod(file, 0o755);
}

beforeEach(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tsw-"));
  box = {
    dir,
    state: path.join(dir, "state-dir"),
    bin: path.join(dir, "bin"),
    calls: path.join(dir, "calls"),
  };
  await mkdir(box.bin, { recursive: true });
  await writeFile(box.calls, "");

  planeHealthy = () => true;
  publicHealthy = () => true;
  slackPosts = [];

  // The healthy shape by default. Note `LoggedOut: false` and a Stopped
  // backend is the *recoverable* shape, and that false is load-bearing: see
  // the regression test below.
  await writeFile(
    path.join(dir, "ts-status.json"),
    JSON.stringify({ BackendState: "Running", AuthURL: "", HaveNodeKey: true })
  );
  await writeFile(path.join(dir, "ts-prefs.json"), JSON.stringify({ LoggedOut: false }));

  await bin(
    box,
    "tailscale",
    [
      `case "$1" in`,
      `  status) cat "${dir}/ts-status.json" ;;`,
      `  debug) cat "${dir}/ts-prefs.json" ;;`,
      // The one side effect that matters: a successful `up` leaves a marker the
      // test's plane handler reads, so "the repair worked" is observed rather
      // than asserted.
      `  up) if [ -f "${dir}/up-fails" ]; then echo "backend in state NoState"; exit 1; fi; touch "${dir}/ts-up-ok"; exit 0 ;;`,
      "esac",
    ].join("\n")
  );

  await writeFile(
    path.join(dir, "services.txt"),
    [
      "An asterisk (*) denotes that a network service is disabled.",
      "(1) Thunderbolt Bridge",
      "(Hardware Port: Thunderbolt Bridge, Device: bridge0)",
      "",
      "(2) Wi-Fi",
      "(Hardware Port: Wi-Fi, Device: en0)",
      "",
      "(*) Old Ethernet",
      "(Hardware Port: Ethernet, Device: en9)",
      "",
    ].join("\n")
  );
  await writeFile(path.join(dir, "dns-current.txt"), "10.0.0.243\n");
  await writeFile(path.join(dir, "route.txt"), "   route to: default\n  interface: en0\n");

  await bin(
    box,
    "networksetup",
    [
      `case "$1" in`,
      `  -listnetworkserviceorder) cat "${dir}/services.txt" ;;`,
      `  -getdnsservers) cat "${dir}/dns-current.txt" ;;`,
      `  -setdnsservers) if [ -f "${dir}/setdns-fails" ]; then exit 1; fi; shift 2; printf '%s\\n' "$@" > "${dir}/dns-current.txt"; touch "${dir}/dns-set"; exit 0 ;;`,
      "esac",
    ].join("\n")
  );

  // Answers by default: the resolver we name by IP is reachable, so a public
  // failure is this host's resolver config and rung 2 applies.
  await bin(
    box,
    "dig",
    [`if [ -f "${dir}/dig-silent" ]; then exit 0; fi`, "echo 104.16.3.34"].join("\n")
  );
  await bin(box, "route", `cat "${dir}/route.txt"`);
});

interface CycleOptions {
  now: number;
  repair?: boolean;
  notify?: boolean;
  /** Overrides, for the handful of tests that need one. */
  env?: Record<string, string>;
}

interface Result {
  code: number;
  stdout: string;
  stderr: string;
  log: string;
  state: Record<string, string> | null;
  override: string | null;
  calls: string[];
}

async function cycle(options: CycleOptions): Promise<Result> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TS_WATCHDOG_DIR: box.state,
    TS_WATCHDOG_FALLBACK_DIR: path.join(box.dir, "fallback"),
    TS_WATCHDOG_PLANE_URL: `${origin}/plane`,
    TS_WATCHDOG_PUBLIC_URL: `${origin}/public`,
    TS_WATCHDOG_SLACK_API: `${origin}/slack`,
    TS_WATCHDOG_SLACK_TOKEN: "xoxb-test-token",
    // Never the real one. A test that reads ~/.openclaw/openclaw.json would be
    // a test that can post to Lacy's DM.
    TS_WATCHDOG_SLACK_TOKEN_FILE: path.join(box.dir, "no-such-token-file"),
    TS_WATCHDOG_TAILSCALE: path.join(box.bin, "tailscale"),
    TS_WATCHDOG_NETWORKSETUP: path.join(box.bin, "networksetup"),
    TS_WATCHDOG_DIG: path.join(box.bin, "dig"),
    TS_WATCHDOG_ROUTE: path.join(box.bin, "route"),
    TS_WATCHDOG_SETTLE: "0",
    TS_WATCHDOG_NOW: String(options.now),
    TZ: "UTC",
    ...(options.env ?? {}),
  };

  const args = [SCRIPT];
  if (options.repair) args.push("--repair");
  if (options.notify) args.push("--notify");

  // Truncated per cycle, so `calls` answers "what did *this* cycle change on
  // the host". A cumulative log cannot express "and the next cycle did
  // nothing", which is exactly what the rate caps and the give-up path are for.
  await writeFile(box.calls, "");

  let code = 0;
  let stdout = "";
  let stderr = "";
  try {
    const out = await run("bash", args, { env });
    stdout = out.stdout;
    stderr = out.stderr;
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    code = failure.code ?? 1;
    stdout = failure.stdout ?? "";
    stderr = failure.stderr ?? "";
  }

  const raw = await readFile(path.join(box.state, "state"), "utf8").catch(() => null);
  const state =
    raw === null
      ? null
      : Object.fromEntries(
          raw
            .trim()
            .split("\n")
            .map((line) => line.split("=") as [string, string])
        );
  return {
    code,
    stdout,
    stderr,
    log: await readFile(path.join(box.state, "tailscale-watchdog.log"), "utf8").catch(() => ""),
    state,
    override: await readFile(path.join(box.state, "dns-override"), "utf8").catch(() => null),
    calls: (await readFile(box.calls, "utf8")).trim().split("\n").filter(Boolean),
  };
}

const T0 = 1_792_000_000;

/** Did the script actually try to change anything on the host? */
const repaired = (r: Result) => r.calls.filter((c) => c.startsWith("tailscale up"));
const dnsWrites = (r: Result) => r.calls.filter((c) => c.startsWith("networksetup -setdnsservers"));

describe("healthy", () => {
  it("exits 0 and keeps no state when both probes answer", async () => {
    const r = await cycle({ now: T0, repair: true, notify: true });
    expect(r.code).toBe(0);
    expect(r.log).toContain("OK plane and public DNS both answer");
    expect(r.state).toBeNull();
    expect(repaired(r)).toEqual([]);
    expect(dnsWrites(r)).toEqual([]);
    expect(slackPosts).toEqual([]);
  });

  it("is not fooled by a reachable plane when public DNS is dead", async () => {
    // The finding that widened this ticket: `tailscale up` restored ts.net and
    // the fleet was still broken, because every npm, GitHub and Vercel call
    // still failed. A watchdog that called this healthy would report success
    // into a dead fleet.
    publicHealthy = () => false;
    const r = await cycle({ now: T0 });
    expect(r.code).toBe(1);
    expect(r.log).toContain("BROKEN public-dns");
  });
});

describe("how long it says it was broken", () => {
  it("reports the window since the last healthy check, not since it noticed", async () => {
    // The first live proof on zero said "healthy again after 0m" about a fleet
    // that had been unable to write for four and a half minutes: the stop
    // happened a second after a healthy cycle, and the next cycle found and
    // fixed it in five seconds. "0m" is the interval's blind spot, not the
    // outage. The last healthy check is the earliest moment it was provably
    // fine, so the honest number is a bound.
    const healthy = await cycle({ now: T0, repair: true, notify: true });
    expect(healthy.code).toBe(0);

    await writeFile(
      path.join(box.dir, "ts-status.json"),
      JSON.stringify({ BackendState: "Stopped", AuthURL: "", HaveNodeKey: true })
    );
    planeHealthy = () => existsSync(path.join(box.dir, "ts-up-ok"));

    const fixed = await cycle({ now: T0 + 300, repair: true, notify: true });
    expect(fixed.code).toBe(0);
    expect(fixed.log).toContain("was broken for up to 5m (last healthy check");
    expect(slackPosts.join()).toContain("Unreachable for up to 5m");
  });

  it("says only what it can prove when there is no healthy check on record", async () => {
    planeHealthy = () => false;
    await writeFile(path.join(box.dir, "ts-prefs.json"), JSON.stringify({ LoggedOut: true }));
    await cycle({ now: T0, repair: true, notify: true });
    const paged = await cycle({ now: T0 + 900, repair: true, notify: true });
    expect(paged.state?.paged).toBe("1");
    expect(slackPosts.join()).toContain("broken for 15m");
    expect(slackPosts.join()).not.toContain("up to");
  });
});

describe("rung 1, the tailnet", () => {
  it("repairs the recoverable shape and reports what it did", async () => {
    // The regression test for the jq trap: `.LoggedOut // "unknown"` returns
    // "unknown" for `false`, because jq's alternative operator treats false as
    // empty. That read every logged-in node as "the CLI did not answer" and
    // refused to repair the one shape this watchdog exists for. `LoggedOut:
    // false` below is the assertion.
    await writeFile(
      path.join(box.dir, "ts-status.json"),
      JSON.stringify({ BackendState: "Stopped", AuthURL: "", HaveNodeKey: true })
    );
    planeHealthy = () => existsSync(path.join(box.dir, "ts-up-ok"));

    const r = await cycle({ now: T0, repair: true, notify: true });
    expect(r.code).toBe(0);
    expect(r.log).toContain("rung 1, tailnet is down in the recoverable shape");
    expect(r.log).toContain("LoggedOut=false");
    expect(repaired(r)).toEqual(["tailscale up --timeout=30s --accept-routes"]);
    expect(r.log).toContain("FIXED tailscale up");
    expect(slackPosts.join()).toContain("the watchdog fixed it");
  });

  it("does not claim a DNS change it did not make this cycle", async () => {
    // The override file outlives the outage that created it, so "does an
    // override exist" is the wrong question to build the message from: a later
    // cycle that fixed the tailnet would report "DNS now overrides DHCP (was
    // unset)" about a change it never made.
    await mkdir(box.state, { recursive: true });
    await writeFile(
      path.join(box.state, "dns-override"),
      "set_at=2026-10-21T15:58:02-0400\nservice=Wi-Fi\nservers=1.1.1.1 8.8.8.8\nprevious=10.0.0.243\n"
    );
    await writeFile(
      path.join(box.dir, "ts-status.json"),
      JSON.stringify({ BackendState: "Stopped", AuthURL: "", HaveNodeKey: true })
    );
    planeHealthy = () => existsSync(path.join(box.dir, "ts-up-ok"));

    const r = await cycle({ now: T0, repair: true, notify: true });
    expect(r.code).toBe(0);
    expect(slackPosts.join()).toContain("the watchdog fixed it");
    expect(slackPosts.join()).not.toContain("overrides DHCP");
    // And the override itself is untouched, because reverting it is Lacy's call.
    expect(r.override).toContain("previous=10.0.0.243");
  });

  it("never touches a logged-out node, and says only a human can fix it", async () => {
    await writeFile(
      path.join(box.dir, "ts-status.json"),
      JSON.stringify({ BackendState: "NeedsLogin", AuthURL: "", HaveNodeKey: false })
    );
    await writeFile(path.join(box.dir, "ts-prefs.json"), JSON.stringify({ LoggedOut: true }));
    planeHealthy = () => false;

    const first = await cycle({ now: T0, repair: true, notify: true });
    expect(repaired(first)).toEqual([]);
    expect(first.log).toContain("NO-REPAIR tailnet needs a human");

    // Still untouched once the threshold is crossed, and the page says why.
    const later = await cycle({ now: T0 + 900, repair: true, notify: true });
    expect(repaired(later)).toEqual([]);
    expect(slackPosts.join()).toContain("needs a human sign-in");
    expect(later.state?.paged).toBe("1");
  });

  it("will not touch a node that is mid-authentication either", async () => {
    await writeFile(
      path.join(box.dir, "ts-status.json"),
      JSON.stringify({
        BackendState: "NeedsLogin",
        AuthURL: "https://login.tailscale.com/a/abc123",
        HaveNodeKey: true,
      })
    );
    planeHealthy = () => false;
    const r = await cycle({ now: T0, repair: true, notify: true });
    expect(repaired(r)).toEqual([]);
    expect(r.log).toContain("needs a human");
  });

  it("does not repair a shape it cannot read", async () => {
    // The daemon not answering at all. `tailscale up` has nothing to talk to,
    // and the 2026-10-21 wedge needed a system-extension restart with sudo.
    await writeFile(path.join(box.dir, "ts-status.json"), "not json");
    planeHealthy = () => false;
    const r = await cycle({ now: T0, repair: true, notify: true });
    expect(repaired(r)).toEqual([]);
    expect(r.log).toContain("the Tailscale CLI did not answer");
  });
});

describe("rung 2, the system resolver", () => {
  beforeEach(async () => {
    publicHealthy = () => existsSync(path.join(box.dir, "dns-set"));
  });

  it("sets a public resolver on the service carrying the default route", async () => {
    const r = await cycle({ now: T0, repair: true, notify: true });
    expect(r.code).toBe(0);
    // Wi-Fi because route said en0, not because Wi-Fi was hardcoded.
    expect(dnsWrites(r)).toEqual(["networksetup -setdnsservers Wi-Fi 1.1.1.1 8.8.8.8"]);
    expect(r.log).toContain("rung 2");
    expect(r.log).toContain("undo with: networksetup -setdnsservers Wi-Fi empty");
  });

  it("records the override with the previous value, and keeps saying so", async () => {
    const r = await cycle({ now: T0, repair: true, notify: true });
    expect(r.override).toContain("service=Wi-Fi");
    expect(r.override).toContain("servers=1.1.1.1 8.8.8.8");
    // 10.0.0.243 may be a Pi-hole Lacy wants back. Nothing here reverts to
    // DHCP on its own, so the previous value has to survive in writing.
    expect(r.override).toContain("previous=10.0.0.243");
    expect(slackPosts.join()).toContain("overrides DHCP");

    // And it is not a one-time message: every healthy cycle afterwards repeats
    // it, so the override cannot become a mystery during the next outage.
    const healthy = await cycle({ now: T0 + 600, repair: true, notify: true });
    expect(healthy.log).toContain("dns-override: 1.1.1.1 8.8.8.8 on Wi-Fi");
    expect(healthy.log).toContain("networksetup -setdnsservers Wi-Fi empty");
  });

  it("changes nothing when the public resolver is silent too", async () => {
    // Public DNS fails and 1.1.1.1 does not answer either, so this is the link
    // or the gateway. Rewriting DNS here would be a wrong repair that outlives
    // the outage.
    await writeFile(path.join(box.dir, "dig-silent"), "");
    const r = await cycle({ now: T0, repair: true, notify: true });
    expect(dnsWrites(r)).toEqual([]);
    expect(r.log).toContain("so the link is down, not the resolver config");

    const later = await cycle({ now: T0 + 900, repair: true, notify: true });
    expect(dnsWrites(later)).toEqual([]);
    expect(slackPosts.join()).toContain("no working internet at all");
  });

  it("does not guess a service when the default route is not a known one", async () => {
    // An exit node can put the default route on utun, which matches no
    // configurable service. Configuring the wrong one is a silent no-op repair,
    // which is worse than no repair.
    await writeFile(path.join(box.dir, "route.txt"), "  interface: utun10\n");
    const r = await cycle({ now: T0, repair: true, notify: true });
    expect(dnsWrites(r)).toEqual([]);
    expect(r.log).toContain("cannot name the network service carrying the default route");
  });

  it("reports a refused networksetup rather than claiming a repair", async () => {
    await writeFile(path.join(box.dir, "setdns-fails"), "");
    const r = await cycle({ now: T0, repair: true, notify: true });
    expect(r.code).toBe(1);
    expect(r.log).toContain("REPAIR-FAILED");
    expect(r.override).toBeNull();
  });

  it("does not install an override for a fault rung 1 was about to clear", async () => {
    // Ordering: ts.net coming back can restore the public path too, because
    // MagicDNS forwards through it. A DNS override installed in that case would
    // be an unnecessary change to Lacy's laptop.
    await writeFile(
      path.join(box.dir, "ts-status.json"),
      JSON.stringify({ BackendState: "Stopped", AuthURL: "", HaveNodeKey: true })
    );
    const up = path.join(box.dir, "ts-up-ok");
    planeHealthy = () => existsSync(up);
    publicHealthy = () => existsSync(up);

    const r = await cycle({ now: T0, repair: true, notify: true });
    expect(r.code).toBe(0);
    expect(repaired(r)).toHaveLength(1);
    expect(dnsWrites(r)).toEqual([]);
    expect(r.override).toBeNull();
  });
});

describe("giving up", () => {
  beforeEach(async () => {
    await writeFile(
      path.join(box.dir, "ts-status.json"),
      JSON.stringify({ BackendState: "NoState", AuthURL: "", HaveNodeKey: true })
    );
    await writeFile(path.join(box.dir, "up-fails"), "");
    planeHealthy = () => false;
  });

  it("stops after three failed attempts, pages once, and stays stopped", async () => {
    // The real 2026-10-21 wedge: `tailscale up` returns, the network extension
    // stays in NoState, and no number of retries changes that.
    const a = await cycle({ now: T0, repair: true, notify: true });
    expect(a.state?.attempts).toBe("1");
    expect(a.state?.gave_up).toBe("0");

    const b = await cycle({ now: T0 + 300, repair: true, notify: true });
    expect(b.state?.attempts).toBe("2");

    const c = await cycle({ now: T0 + 600, repair: true, notify: true });
    expect(c.state?.attempts).toBe("3");
    expect(c.state?.gave_up).toBe("1");
    expect(c.log).toContain("GAVE-UP");
    expect(c.state?.paged).toBe("1");
    expect(slackPosts).toHaveLength(1);
    expect(slackPosts[0]).toContain("could not fix it");

    // And it does not loop forever: no further repair attempts, no second page.
    const d = await cycle({ now: T0 + 900, repair: true, notify: true });
    expect(d.log).toContain("NO-REPAIR already gave up");
    expect(d.log).toContain("STILL-BROKEN");
    expect(slackPosts).toHaveLength(1);
    const attempts = [a, b, c, d].flatMap((r) => repaired(r));
    expect(attempts).toHaveLength(3);
  });

  it("counts attempts across runs, not within one", async () => {
    // The counter is only useful if it survives the process, which is the whole
    // reason it is in a file rather than a variable.
    await cycle({ now: T0, repair: true, notify: true });
    const second = await cycle({ now: T0 + 300, repair: true, notify: true });
    expect(second.state?.attempts).toBe("2");
    expect(second.state?.down_since).toBe(String(T0));
  });

  it("rearms once the host is healthy again", async () => {
    await cycle({ now: T0, repair: true, notify: true });
    await cycle({ now: T0 + 300, repair: true, notify: true });
    const gaveUp = await cycle({ now: T0 + 600, repair: true, notify: true });
    expect(gaveUp.state?.gave_up).toBe("1");

    planeHealthy = () => true;
    const back = await cycle({ now: T0 + 900, repair: true, notify: true });
    expect(back.code).toBe(0);
    expect(back.log).toContain("RECOVERED for 15m");
    expect(slackPosts.at(-1)).toContain("Zero is back on the network");
    expect(back.state).toBeNull();
  });
});

describe("rate caps", () => {
  beforeEach(async () => {
    await writeFile(
      path.join(box.dir, "ts-status.json"),
      JSON.stringify({ BackendState: "Stopped", AuthURL: "", HaveNodeKey: true })
    );
    await writeFile(path.join(box.dir, "up-fails"), "");
    planeHealthy = () => false;
  });

  it("will not retry inside the floor between attempts", async () => {
    const first = await cycle({ now: T0, repair: true, notify: true });
    expect(repaired(first)).toHaveLength(1);

    // A RunAtLoad burst, or a hand-run loop. The fleet's only network path must
    // not be flapped harder by us than it is flapping on its own.
    const soon = await cycle({ now: T0 + 30, repair: true, notify: true });
    expect(soon.log).toContain("NO-REPAIR rate cap");
    expect(soon.calls.filter((c) => c.startsWith("tailscale up"))).toEqual([]);
    expect(soon.state?.attempts).toBe("1");
  });

  it("caps repairs that keep working, which the attempt counter cannot see", async () => {
    // Every successful repair resets the attempt counter, so a node that breaks
    // every few minutes would otherwise be repaired forever in silence.
    const up = path.join(box.dir, "ts-up-ok");
    await rm(path.join(box.dir, "up-fails"));
    planeHealthy = () => existsSync(up);

    let now = T0;
    for (let i = 0; i < 6; i += 1) {
      const fixed = await cycle({ now, repair: true, notify: true });
      expect(fixed.code).toBe(0);
      await rm(up); // it breaks again
      now += 300;
    }

    const capped = await cycle({ now, repair: true, notify: true });
    expect(capped.log).toContain("6 repairs already in the last");
    expect(repaired(capped)).toEqual([]);
  });
});

describe("a dry run owes nothing", () => {
  beforeEach(async () => {
    await writeFile(
      path.join(box.dir, "ts-status.json"),
      JSON.stringify({ BackendState: "Stopped", AuthURL: "", HaveNodeKey: true })
    );
    planeHealthy = () => false;
  });

  it("prints what it would do, changes nothing, and writes no state", async () => {
    const r = await cycle({ now: T0 });
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("would repair: tailscale up --timeout=30s --accept-routes");
    expect(repaired(r)).toEqual([]);
    expect(r.state).toBeNull();
  });

  it("prints the page it would send without spending it", async () => {
    // A dry run during a real outage must not consume the page a real cycle
    // still owes, which means it prints the message and leaves `paged` alone.
    await cycle({ now: T0, repair: true, notify: true });
    const dry = await cycle({ now: T0 + 900 });
    expect(dry.stdout).toContain("would page:");
    expect(slackPosts).toEqual([]);
    expect(dry.state?.paged).toBe("0");
  });
});

describe("it cannot switch its own pager off", () => {
  it("falls back to another directory when the first will not take a write", async () => {
    const r = await cycle({
      now: T0,
      repair: true,
      notify: true,
      env: { TS_WATCHDOG_DIR: "/this/does/not/exist" },
    });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("state is in");
    const fallbackLog = await readFile(
      path.join(box.dir, "fallback", "tailscale-watchdog.log"),
      "utf8"
    );
    expect(fallbackLog).toContain("degraded:");
  });

  it("exits 2, never 0, when there is nowhere at all to keep state", async () => {
    const r = await cycle({
      now: T0,
      repair: true,
      notify: true,
      env: {
        TS_WATCHDOG_DIR: "/this/does/not/exist",
        TS_WATCHDOG_FALLBACK_DIR: "/this/does/not/exist/either",
      },
    });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("cannot write to");
  });

  it("pages that it is blind when the state write fails mid-outage", async () => {
    // The silent-watchdog failure mode, and the one in the acceptance criteria:
    // an unchecked state write plus a full disk means the clock restarts every
    // cycle, the threshold is never reached, and a twelve-hour outage produces
    // zero pages. A directory where the state file belongs is a full disk that
    // fits in a test.
    await mkdir(path.join(box.state, "state"), { recursive: true });
    planeHealthy = () => false;
    await writeFile(
      path.join(box.dir, "ts-status.json"),
      JSON.stringify({ BackendState: "NoState", AuthURL: "", HaveNodeKey: true })
    );
    await writeFile(path.join(box.dir, "up-fails"), "");

    const r = await cycle({ now: T0, repair: true, notify: true });
    expect(r.code).toBe(1);
    expect(r.log).toContain("STATE-WRITE-FAILED");
    expect(slackPosts.join()).toContain("Treat silence from it as meaningless");
  });

  it("exits 2 rather than reporting health when a tool it needs is missing", async () => {
    const r = await cycle({
      now: T0,
      repair: true,
      notify: true,
      env: { TS_WATCHDOG_DIG: path.join(box.dir, "no-dig") },
    });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("not executable");
  });

  it("keeps the outage open when Slack rejects the page", async () => {
    // A transient Slack failure must not spend the one page an outage is owed.
    planeHealthy = () => false;
    await writeFile(path.join(box.dir, "ts-prefs.json"), JSON.stringify({ LoggedOut: true }));
    await cycle({ now: T0, repair: true, notify: true });
    const r = await cycle({
      now: T0 + 900,
      repair: true,
      notify: true,
      env: { TS_WATCHDOG_SLACK_API: `${origin}/nope` },
    });
    expect(r.log).toContain("NOTIFY-FAILED");
    expect(r.state?.paged).toBe("0");
  });
});
