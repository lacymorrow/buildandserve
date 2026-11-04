import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

const SCRIPT = path.resolve(__dirname, "../../../scripts/bas-projects-db.sh");

/**
 * `bas-projects-db.sh pooler-cert-check` (LAC-6122 F1/F8, fixed in LAC-6245).
 *
 * This is the check the hourly watch runs over ssh, and it decides two things
 * that are expensive to get wrong in either direction: whether the pooler is
 * serving the certificate on disk, and whether it can still reach its own
 * server over the private bridge. A missed finding is the 3h50m outage of
 * 2026-10-29; a false finding pages "every pooled project is down" on an hourly
 * cadence and teaches the operator to ignore the watch.
 *
 * The box is a `bin/` of stubs on PATH rather than a mock layer, because the
 * only inputs to the check are what `docker` and `openssl` print. Every knob is
 * a file the test writes, so each case reads as the state of a real box.
 */
let box: { dir: string; bin: string; stub: string; root: string };

const DB_HOST = "projects-db.test";
const DISK_FP = "AA:BB:CC";
const PG_IP = "172.31.0.2";

/** A PEM body. Content is irrelevant: the stubbed `openssl` never parses it. */
const PEM = ["-----BEGIN CERTIFICATE-----", "c3R1Yg==", "-----END CERTIFICATE-----"].join("\n");

beforeEach(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pooler-cert-check-"));
  box = {
    dir,
    bin: path.join(dir, "bin"),
    stub: path.join(dir, "stub"),
    root: path.join(dir, "root"),
  };
  await mkdir(box.bin, { recursive: true });
  await mkdir(box.stub, { recursive: true });
  await mkdir(path.join(box.root, "conf"), { recursive: true });
  await writeFile(path.join(box.root, "conf", "server.crt"), PEM);

  // Healthy box by default. Each test overrides only what it is about.
  await state({
    poolerState: "running",
    getentOut: `${PG_IP}      ${DB_HOST}`,
    getentExit: 0,
    pgIps: `${PG_IP} `,
    servedPem: PEM,
    sClientExit: 0,
    servedFp: DISK_FP,
    diskFp: DISK_FP,
    san: DB_HOST,
  });
  await stubs();
});

afterEach(async () => {
  await rm(box.dir, { recursive: true, force: true });
});

interface BoxState {
  poolerState: string;
  getentOut: string;
  getentExit: number;
  pgIps: string;
  servedPem: string;
  sClientExit: number;
  servedFp: string;
  diskFp: string;
  san: string;
}

/** Writes the stub knobs. Partial on purpose, so a case names only its fault. */
async function state(next: Partial<BoxState>) {
  const files: Record<keyof BoxState, string> = {
    poolerState: "pooler_state",
    getentOut: "getent_out",
    getentExit: "getent_exit",
    pgIps: "pg_ips",
    servedPem: "served_pem",
    sClientExit: "s_client_exit",
    servedFp: "served_fp",
    diskFp: "disk_fp",
    san: "san",
  };
  for (const [key, file] of Object.entries(files)) {
    const value = next[key as keyof BoxState];
    if (value === undefined) continue;
    await writeFile(path.join(box.stub, file), String(value));
  }
}

async function script(name: string, body: string[]) {
  const file = path.join(box.bin, name);
  await writeFile(file, ["#!/bin/bash", `STUB="${box.stub}"`, ...body].join("\n"));
  await chmod(file, 0o755);
}

async function stubs() {
  // The script refuses to run as anyone but root on the box.
  await script("id", ["echo 0"]);
  // The retry on an empty probe must not cost the suite two seconds.
  await script("sleep", ["exit 0"]);

  await script("docker", [
    'case "$1" in',
    "inspect)",
    '  for a in "$@"; do case "$a" in',
    '  *State.Status*) cat "$STUB/pooler_state"; exit 0 ;;',
    '  *NetworkSettings.Networks*) cat "$STUB/pg_ips"; exit 0 ;;',
    "  esac; done",
    "  exit 0 ;;",
    "exec)",
    '  cat "$STUB/getent_out"; exit "$(cat "$STUB/getent_exit")" ;;',
    "esac",
    "exit 0",
  ]);

  // `s_client` prints the certificate and then may exit non-zero: on the pooled
  // port the handshake cannot complete, and whether the TLS 1.3 `certificate
  // required` alert lands before openssl exits is a race. `x509` answers from a
  // file for the cert on disk and from stdin for the one that was served.
  await script("openssl", [
    'case "$1" in',
    "s_client)",
    '  cat "$STUB/served_pem"; exit "$(cat "$STUB/s_client_exit")" ;;',
    "x509)",
    '  from_file=""; want_san=""',
    "  while [ $# -gt 0 ]; do",
    '    case "$1" in',
    '    -in) from_file="$2"; shift ;;',
    "    -ext) want_san=1 ;;",
    "    esac",
    "    shift",
    "  done",
    '  if [ -n "$from_file" ]; then',
    '    [ -s "$from_file" ] || exit 1',
    '    echo "SHA256 Fingerprint=$(cat "$STUB/disk_fp")"; exit 0',
    "  fi",
    "  input=$(cat)",
    '  [ -n "$input" ] || exit 1',
    '  if [ -n "$want_san" ]; then',
    '    echo "X509v3 Subject Alternative Name:"',
    '    echo "    DNS:$(cat "$STUB/san")"; exit 0',
    "  fi",
    '  echo "SHA256 Fingerprint=$(cat "$STUB/served_fp")"; exit 0 ;;',
    "esac",
    "exit 0",
  ]);
}

async function check() {
  try {
    const { stdout, stderr } = await run("bash", [SCRIPT, "pooler-cert-check"], {
      env: {
        ...process.env,
        PATH: `${box.bin}:${process.env.PATH}`,
        ROOT: box.root,
        DB_HOST,
      },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

describe("a healthy pooler", () => {
  it("is silent and exits 0", async () => {
    const result = await check();
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("is silent when there is no pooler at all, because that is a supported shape", async () => {
    await state({ poolerState: "" });
    const result = await check();
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});

describe("the pooler's route to its own server", () => {
  /**
   * The fault that ran 3h50m on 2026-10-29: a `projects-db` recreate drops the
   * private bridge, the pooler resolves the certificate's name to the public
   * address where tcp/5432 is not published, and every pooled login fails
   * `server down` while the certificate on both ports reads perfect.
   */
  it("reports a server address that is not the projects-db container", async () => {
    await state({ getentOut: `203.0.113.9   ${DB_HOST}` });
    const result = await check();
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("a recreate dropped the pool network");
    expect(result.stdout).toContain("bas-pgbouncer.sh network");
  });

  it("reports a pooler that cannot resolve its server at all", async () => {
    await state({ getentOut: "", getentExit: 1 });
    const result = await check();
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("cannot resolve");
  });

  /**
   * Both halves of the check share one findings array, and a second `local`
   * declaration of it silently dropped every network finding (LAC-6245). Asking
   * for both faults at once is what catches that: the certificate finding alone
   * still arrived, so the bug was invisible to any case with a single fault.
   */
  it("reports a network fault and a certificate fault together", async () => {
    await state({ getentOut: `203.0.113.9   ${DB_HOST}`, servedFp: "DD:EE:FF" });
    const result = await check();
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("a recreate dropped the pool network");
    expect(result.stdout).toContain("without a pooler RELOAD");
  });
});

describe("the certificate the pooler serves", () => {
  it("reports served-vs-disk drift as a missed RELOAD", async () => {
    await state({ servedFp: "DD:EE:FF" });
    const result = await check();
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("without a pooler RELOAD");
  });

  it("reports a certificate that does not name the host", async () => {
    await state({ san: "somewhere.else" });
    const result = await check();
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("does not name");
  });

  it("reports a pooler that is up and serving no certificate", async () => {
    await state({ servedPem: "", sClientExit: 1 });
    const result = await check();
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("serves no TLS cert");
  });

  /**
   * Measured on the live pooler 2026-10-29: `openssl s_client` exited 1 on 3 of
   * 40 probes and printed the server certificate on all 40. Deciding on the exit
   * status threw the good read away and reported the pooler as serving nothing,
   * which is an hourly page claiming every pooled project is down (LAC-6245).
   */
  it("keeps a certificate openssl printed even though the handshake failed", async () => {
    await state({ sClientExit: 1 });
    const result = await check();
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});
