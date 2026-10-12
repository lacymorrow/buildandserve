import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * LAC-4279 guardrails for the BAS automation server.
 *
 * The ticket names four things removed on purpose: auto-upgrade, the embedded
 * Postgres, extra agents, and a public UI. Three of those are decisions encoded
 * in shell scripts, which is exactly the kind of thing that drifts back in
 * during a later edit. These tests fail when it does.
 *
 * Runbook: docs/ops/bas-automation-server.md
 */

const root = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const setup = read("scripts/bas-setup.sh");
const provision = read("scripts/bas-provision.sh");
const healthBlock = read("scripts/bas-fleet-health-block.sh");
const runbook = read("docs/ops/bas-automation-server.md");

const pinnedVersion = () => {
  const m = setup.match(/^PAPERCLIP_VERSION="([^"]+)"$/m);
  expect(m, "bas-setup.sh must declare PAPERCLIP_VERSION").not.toBeNull();
  return (m as RegExpMatchArray)[1];
};

/** The cloud-init document, which Hetzner hands back to anyone with the token. */
const cloudInit = () => {
  const m = provision.match(/<<'CLOUDINIT'[^\n]*\n([\s\S]*?)\nCLOUDINIT/);
  expect(m, "bas-provision.sh must contain a CLOUDINIT heredoc").not.toBeNull();
  return (m as RegExpMatchArray)[1];
};

describe("the Paperclip version stays pinned", () => {
  it("is an exact version, not a range or a tag", () => {
    const v = pinnedVersion();
    expect(v).toMatch(/^\d{4}\.\d{4}\.\d+$/);
    expect(v).not.toMatch(/latest|next|beta|canary|[\^~*x]/i);
  });

  it("is installed with that exact version", () => {
    expect(setup).toContain("paperclipai@$PAPERCLIP_VERSION");
    // `npm install -g paperclipai` with no version resolves to latest, which
    // would silently unpin the box on any re-run of the setup script.
    expect(setup).not.toMatch(/npm (install|i) -g[^\n]*paperclipai(?!@)/);
  });

  it("agrees with the version written in the runbook", () => {
    expect(runbook).toContain(pinnedVersion());
  });

  it("installs no auto-upgrade job", () => {
    // Zero's nightly upgrade plist is the thing this box exists without.
    for (const source of [setup, provision]) {
      expect(source).not.toMatch(/OnCalendar=[^\n]*\n[^\n]*paperclipai@latest/);
      expect(source).not.toMatch(/paperclipai@latest/);
      expect(source).not.toMatch(/npm update -g/);
    }
  });
});

describe("secrets stay out of cloud-init", () => {
  // Hetzner returns user_data from the API, and the box's metadata service
  // serves it to every local process. Anything in it is effectively public.
  it("carries no token, password or key material", () => {
    const ci = cloudInit();
    expect(ci).not.toMatch(/oauth/i);
    expect(ci).not.toMatch(/CLAUDE_CODE_OAUTH_TOKEN/);
    expect(ci).not.toMatch(/PASSWORD|PGPASSWORD/);
    expect(ci).not.toMatch(/tskey-/);
    expect(ci).not.toMatch(/--authkey/);
    expect(ci).not.toMatch(/DATABASE_URL/);
  });

  it("does not bring Tailscale up, because that would need a credential", () => {
    expect(cloudInit()).not.toMatch(/tailscale up/);
  });

  it("passes the OAuth token over stdin rather than an argument", () => {
    // An argv is visible in ps and in shell history on the far side.
    expect(setup).toMatch(/<\s*"\$OAUTH_TOKEN_FILE"/);
    expect(setup).not.toMatch(/--token[= ]\$\(cat/);
  });
});

describe("the box survives being killed, and its logs stay bounded", () => {
  it("restarts always", () => {
    expect(setup).toContain("Restart=always");
  });

  it("gives up after a burst instead of hammering Postgres in silence", () => {
    expect(setup).toMatch(/StartLimitBurst=\d+/);
  });

  it("caps the journal and rotates any log file Paperclip writes itself", () => {
    // server.log reached 2 GB on zero because nothing rotated it.
    const ci = cloudInit();
    expect(ci).toMatch(/SystemMaxUse=\d+[MG]/);
    expect(ci).toContain("/etc/logrotate.d/paperclip");
    expect(ci).toMatch(/maxsize \d+M/);
  });
});

describe("the control plane is not reachable from the internet", () => {
  it("binds to localhost", () => {
    expect(setup).toMatch(/^\s*HOST=127\.0\.0\.1$/m);
  });

  it("opens no port but ssh, Tailscale and icmp in the provisioning script", () => {
    // The firewall itself lives in the Hetzner project; this guards the
    // script from growing a rule that publishes the board.
    expect(provision).not.toMatch(/"port":\s*"3100"/);
    expect(provision).not.toMatch(/port.*(80|443|3100)/);
  });

  it("is published on the tailnet, not on the public interface", () => {
    expect(setup).toContain("tailscale serve");
    expect(setup).toContain("http://127.0.0.1:3100");
  });
});

describe("it proves which database it came up on", () => {
  it("sets DATABASE_URL, which is what selects the real Postgres", () => {
    expect(setup).toMatch(/DATABASE_URL=postgres:\/\//);
  });

  it("fails loudly rather than quietly using the embedded database", () => {
    expect(setup).toContain("came up on its embedded database");
    expect(setup).toMatch(/exit 1/);
  });
});

describe("location is a decision, not a default", () => {
  it("refuses to create a server without an explicit location", () => {
    expect(provision).toMatch(/:\s*"\$\{BAS_LOCATION:\?/);
    expect(provision).not.toMatch(/BAS_LOCATION:-/);
  });

  it("never rebuilds a box that already exists", () => {
    expect(provision).toContain("nothing to do; this script never rebuilds an existing box");
  });
});

describe("outside monitoring cannot fail open", () => {
  it("checks liveness, job freshness and off-box backup age separately", () => {
    expect(healthBlock).toMatch(/check bas "/);
    expect(healthBlock).toMatch(/check bas-jobs "/);
    expect(healthBlock).toMatch(/check bas-backup "/);
  });

  it("judges backup age on the NAS, so a dead box still fails", () => {
    // Asking the box how its backups are going is useless when the box is gone.
    expect(healthBlock).toContain("100.119.64.141");
    expect(healthBlock).toMatch(/BAS_NAS_DIR/);
  });

  it("logs a visible skip while the box does not exist", () => {
    expect(healthBlock).toMatch(/log "SKIP bas:/);
  });

  it("namespaces every variable it assigns", () => {
    // This block is pasted into a 1573-line script of shared globals, whose own
    // sections prefix their working variables (pc_newest, pc_push_due). A bare
    // `stale` or `hrs` here can silently collide with another section's, and the
    // first version of this block shipped exactly that.
    const assigned = [...healthBlock.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)=/gm)].map((m) => m[1]);
    expect(assigned.length).toBeGreaterThan(5);
    const leaked = assigned.filter((v) => !/^(BAS_|bas_|CHECK_)/.test(v));
    expect(leaked, `unnamespaced globals: ${leaked.join(", ")}`).toEqual([]);
  });

  it("reads its loop variables under the same namespace", () => {
    // `read -r title hours` assigns too, and no regex over `name=` catches it.
    // Only the block's own loops matter: a `read` inside a quoted remote command
    // runs in a shell on the far host and cannot collide with anything here.
    const ownLoops = healthBlock
      .split("\n")
      .filter((l) => /^\s*while\s+IFS=/.test(l))
      .flatMap((l) => (l.match(/read -r ([^\n;]+)/)?.[1] ?? "").trim().split(/\s+/))
      .filter(Boolean);
    expect(ownLoops.length).toBeGreaterThan(0);
    for (const v of ownLoops) expect(v).toMatch(/^bas_/);
  });
});
