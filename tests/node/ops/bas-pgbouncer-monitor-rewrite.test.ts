import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const SCRIPT = path.resolve(__dirname, "../../../scripts/bas-pgbouncer.sh");

/**
 * `drop_monitor` in bas-pgbouncer.sh (LAC-6423, follow-up to LAC-6122).
 *
 * The script needs root, docker and /data, so the harness pulls the real
 * function bodies out of it with awk and runs them against a temp dir with
 * `reload`, `ensure_ini` and `chown` stubbed. What is under test is the file
 * rewrite: it must keep every other role's line, and it must refuse rather than
 * install an empty file when the source cannot be read.
 */
let dir: string;
let userlist: string;
let hba: string;

const HBA_OTHER = "hostssl proj_a proj_a all cert";
const HBA_MON = "hostssl fleet_monitor fleet_monitor all cert";

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pgb-monitor-"));
  userlist = path.join(dir, "userlist.txt");
  hba = path.join(dir, "pgb_hba.conf");
  await writeFile(userlist, '"pgbadmin" ""\n"proj_a" "pw-a"\n"fleet_monitor" "pw-m"\n');
  await writeFile(hba, `${HBA_OTHER}\n${HBA_MON}\n`);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function dropMonitor() {
  const harness = `
set -euo pipefail
log() { :; }
chown() { :; }
reload() { :; }
ensure_ini() { :; }
valid_role() { :; }
PGB_UID=0 PGB_GID=0
CONF="${dir}/conf"
USERLIST="${userlist}"
HBA="${hba}"
MONITOR_ROLE=fleet_monitor
for f in filter_file ensure_userlist drop_monitor; do
  eval "$(awk -v f="$f" '$0 ~ "^"f"\\\\(\\\\) \\\\{" {p=1} p {print} p && /^}/ {exit}' "${SCRIPT}")"
done
drop_monitor
`;
  return run("bash", ["-c", harness]).then(
    (r) => ({ code: 0, stderr: r.stderr }),
    (e: { code: number; stderr: string }) => ({ code: e.code, stderr: e.stderr }),
  );
}

describe("drop_monitor", () => {
  it("removes only the monitor's userlist and hba lines", async () => {
    const result = await dropMonitor();
    expect(result.code).toBe(0);
    const u = await readFile(userlist, "utf8");
    expect(u).toContain('"proj_a" "pw-a"');
    expect(u).toContain('"pgbadmin"');
    expect(u).not.toContain("fleet_monitor");
    const h = await readFile(hba, "utf8");
    expect(h).toContain(HBA_OTHER);
    expect(h).not.toContain("fleet_monitor");
  });

  it("recreates a missing userlist instead of installing an empty one", async () => {
    await rm(userlist);
    const result = await dropMonitor();
    expect(result.code).toBe(0);
    expect(await readFile(userlist, "utf8")).toContain('"pgbadmin" ""');
  });

  it("refuses when the hba cannot be read, leaving it untouched", async () => {
    await rm(hba);
    await writeFile(`${hba}.keep`, "");
    const result = await dropMonitor();
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("refusing to rewrite");
  });

  it("refuses on an unreadable hba (grep exit 2), keeping its contents", async () => {
    if (process.getuid?.() === 0) return;
    await chmod(hba, 0o000);
    const result = await dropMonitor();
    await chmod(hba, 0o644);
    expect(result.code).not.toBe(0);
    expect(await readFile(hba, "utf8")).toContain(HBA_OTHER);
  });
});
