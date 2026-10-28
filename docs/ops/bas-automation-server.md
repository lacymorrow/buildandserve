# BAS automation server

The box that runs Build and Serve client automations. Pinned Paperclip on
Hetzner, real Postgres, backups off the box, watched from somewhere else.

Ticket: LAC-4279. First job it will run: [Doug store watch](./doug-store-watch.md).

## Status

**Running.** Provisioned 2026-10-12 in Falkenstein.

| Thing | State |
|---|---|
| Hetzner project | BAS Automation (16372856), separate from the production project so this token cannot touch prod |
| Server | `bas`, id 169986608, `128.140.50.130`, **cx33** (4 vCPU / 8 GB), fsn1, EUR 9.99/mo |
| ssh keys | `bas-zero-lacy` (131232206), `bas-graphite-fleet-health` (131232207) |
| Firewall | `bas-automation` (11789519): inbound tcp/22, udp/41641, icmp. Nothing else. |
| Paperclip | 2026.1005.0, pinned, on node 24.21.0 |
| Postgres | real, loopback 5432, 226 tables. Nothing listening on the embedded 54329. |
| Service | `paperclip.service` active, `Restart=always`, survives `kill -9` |
| Backups | every 12h to `/var/backups/paperclip`, shipped nightly 03:30 to the NAS |
| Restore | tested 2026-10-13 with real rows: 226 tables, company + Operator came back |
| Company | **Build and Serve**, prefix `BAS`, one **Operator** agent (Opus 5, heartbeat off) |
| Monitoring | installed on graphite, **still skipping**: waiting on the tailnet name |

Left to do, both needing Lacy:

- **Tailscale.** `tailscale up --hostname=bas` on the box prints a URL she has to
  open once. Until then there is no `bas.hyrax-boga.ts.net`, the monitor stays
  off, and the off-box backup cannot reach the NAS (it is a tailnet address).
- **AI connection.** Wire her Max account as the company's default connection,
  then enable Operator's heartbeat. See
  [Company and roster](#company-and-roster).

## Why this exists

Two outages, one week:

- raw-kratom.com was down for two days and nobody noticed (LACA-1909).
- LACA itself was down 14 hours on 2026-10-11 from a quota outage.

Client automations have to keep running when a laptop closes, and the thing that
notices they stopped cannot be the thing that stopped.

## Hard rules

1. **The version is pinned.** `2026.1005.0`, the same version zero runs.
   There is no auto-upgrade job and there must never be one. Zero's nightly
   upgrade plist is the thing this box exists without.
2. **Upgrades are deliberate.** Only after the new version has run on zero for
   3 or more days. See [Upgrading](#upgrading).
3. **Real Postgres, not the embedded one.** `bas-setup.sh` fails loudly rather
   than quietly running on the embedded database.
4. **No public Paperclip port.** The control plane binds to 127.0.0.1 and is
   reached over the tailnet. The firewall allows ssh and Tailscale only.
5. **No secrets in cloud-init.** Hetzner serves `user_data` back from the API
   and from the box's own metadata service, so anything in it is readable by
   every local process and every holder of the project token. Secrets go over
   ssh, after boot.
6. **Clients never see the Paperclip board.**

## Location and cost

Settled: **cx33 in Falkenstein, EUR 9.99/mo.** How it got there matters, because
the ticket's numbers were impossible.

Hetzner's live prices on 2026-10-12, for 4 vCPU / 8 GB:

| Type | Location | Price | Note |
|---|---|---|---|
| cx33 | fsn1 | **EUR 9.99/mo** | what runs |
| cpx31 | fsn1 | EUR 20.49/mo | approved ceiling |
| cpx31 | ash | EUR 73.49/mo | as originally ticketed |

The ticket asked for CPX31, in Ashburn, at about EUR 15/mo. Those three could not
all be true: US locations now carry a roughly 3.5x premium across every shared
type, and EUR 15 was the old EU price. Lacy approved Falkenstein, and CPX31 turns
out not to be offered in fsn1 at all ("unsupported location for server type"), so
the box is a cx33: same 4 vCPU and 8 GB, Intel instead of AMD, less than half the
approved price. EUR 120/yr against EUR 881/yr for the Ashburn original.

EU rather than US costs nothing here. The workload is agent heartbeats plus
read-only HTTPS fetches of client sites every 4 hours, backups go to the library
NAS over Tailscale from anywhere, and only public-site monitoring data lives on
the box, so no client PII crosses a border.

`bas-provision.sh` has no default location on purpose. It refuses to run until
you pass one, because that argument is what sets the monthly bill.

## Build

```bash
# 1. create the server (BAS_LOCATION is mandatory)
BAS_LOCATION=fsn1 BAS_TYPE=cx33 ./scripts/bas-provision.sh

# 2. join the tailnet. This prints a URL that Lacy has to open once; there is no
#    Tailscale auth key in the secrets store, and an interactive login avoids
#    putting a reusable key there.
ssh root@<ip> 'tailscale up --hostname=bas'

# 3. Postgres, pinned Paperclip, systemd, backup timer, and the proof that it
#    came up on the real database
./scripts/bas-setup.sh <ip>

# 4. authorize the box to write backups to the NAS: add the public key printed
#    by step 3 to library:/root/.ssh/authorized_keys, then
ssh root@<ip> systemctl start bas-ship-backup.service

# 5. publish on the tailnet with a real certificate and no public port
ssh root@<ip> 'tailscale serve --bg https / http://127.0.0.1:3100'
curl https://bas.hyrax-boga.ts.net/api/health

# 6. turn the outside monitoring on
ssh graphite 'touch ~/.paperclip/fleet-health/bas-enabled'
```

## Company and roster

Created 2026-10-13. Nothing else goes on the roster yet.

| | |
|---|---|
| Company | **Build and Serve**, `81dd8f55-cf77-4726-bb91-7f6d6b726ece`, prefix `BAS` |
| Agent | **Operator**, `fbc7e6a7-28c6-4ff6-8974-48ddd0715096`, `claude_local`, `claude-opus-5` |

Not `claude-opus-5-5`: the bundled Claude Code (2.1.257) rejects it, which is why
the whole fleet sits on Opus 5.

**Operator's heartbeat is deliberately disabled** (`heartbeat.enabled: false`,
`wakeOnDemand: true`), the same shape Banks uses on graphite. Until an AI
connection is wired, a heartbeat-enabled agent would fail every wake, and this
fleet has already paid for that: mis-classified failures turn into
`transient_failure` retry storms (LAC-2760). Routines still wake it on demand.
**Turn the heartbeat on only after a run succeeds.**

Still Lacy's to do: wire the Max account as this company's AI connection. The
token is already on the box in `/etc/paperclip/paperclip.env` as
`CLAUDE_CODE_OAUTH_TOKEN`, but selecting a company's default connection is a UI
flow on her account, and on the LAC board it also needed
`PUT /api/companies/:cid/ai-connections/default` with a `grantId` before the
default actually moved.

**No cheap model tier on this version.** `runtimeConfig.modelProfiles` is
rejected outright by 2026.1005.0 ("no longer supported") and the string `cheap`
appears nowhere in the shipped bundle, so the Opus-primary / Sonnet-fallback
pairing the ticket asked for cannot be expressed here. Opus 5 primary is set;
there is no second tier to set. Worth checking whether the `cheap` profiles
applied across the other boards on 2026-10-11 are now inert.

## Upgrading

Not automatic, and not a surprise.

1. Check the version has been running on zero for 3+ days.
2. `ssh root@bas 'npm install -g paperclipai@<version> && systemctl restart paperclip'`
3. Update `PAPERCLIP_VERSION` in `scripts/bas-setup.sh` and the pin in this file.
   A test asserts those two agree, so a drifting pin fails CI.
4. Watch `/api/health` and the next job run before walking away.

## Backups and restore

Paperclip writes its own dumps to `/var/backups/paperclip` **every 12 hours**,
which is what makes `/api/health` report a backup age the outside monitor can
check. 12 and not 24 because the monitor alarms at 26h: a nightly interval
leaves only two hours of slack before one late run looks like a real failure.
`bas-ship-backup.timer` copies the newest dump to
`library:/mnt/user/backups/paperclip-bas/` at 03:30 and keeps 14 there, so the
off-box copy is never more than 12h behind. A backup that only exists on the box
it is backing up is not a backup.

The first dump is taken during setup. Otherwise the box spends its first half day
with no backup at all, which the monitor correctly reports as a failure the
moment it is switched on.

### Restore test

Run once, output on LAC-4279. Dumps are gzipped plain SQL, so `psql`, not
`pg_restore`. `ON_ERROR_STOP=1` is the point: without it psql reports success
having skipped every failed statement.

```bash
ssh root@128.140.50.130
newest=$(ls -t /var/backups/paperclip/*.sql.gz | head -1)
su - postgres -c "dropdb --if-exists paperclip_restore_test"
su - postgres -c "createdb paperclip_restore_test"
gunzip -c "$newest" > /tmp/r.sql && chmod 644 /tmp/r.sql
su - postgres -c "psql -q -v ON_ERROR_STOP=1 -d paperclip_restore_test -f /tmp/r.sql"
# compare against live, then clean up
su - postgres -c "dropdb paperclip_restore_test"; rm -f /tmp/r.sql
```

Result, 2026-10-13, re-run after the company and Operator existed so it proves
rows and not just tables:

```
restore: OK (ON_ERROR_STOP=1, no errors)
restored copy: tables=226  companies=1  agents=1  prefix=BAS
               operator_model=claude-opus-5  heartbeat_enabled=false
scratch dropped; live untouched
```

The first attempt ran against an empty board and every row count was zero, which
proved only that the schema restores. Re-run it after any change you would hate
to lose. A restore that has never been tried is a guess, not a backup.

## Monitoring

Checks live in graphite's `~/.paperclip/fleet-health-check.sh`, section 1c,
which runs every 15 minutes. The reviewable copy is
`scripts/bas-fleet-health-block.sh` in this repo; the authoritative one is on
graphite. No new launchd agent: three of those did not survive the 2026-09-24
host cutover and nobody noticed for three weeks.

| Check | Fails when |
|---|---|
| `bas` | `https://bas.hyrax-boga.ts.net/api/health` is not ok, or its own DB backup is older than 26h |
| `bas-jobs` | an active routine has not completed in 9h (`FLEET_HEALTH_BAS_JOB_MAX_HOURS`), or has never completed |
| `bas-backup` | the newest dump on the NAS is older than 26h, judged on the NAS so a dead box fails too |

Alerts go out on the existing path: Slack, the Lifeboard board line, and a
Paperclip issue. All three checks also appear in `state/vitals.json`.

Until `~/.paperclip/fleet-health/bas-enabled` exists the section logs a visible
`SKIP bas` line every run, so an unbuilt box cannot hide.

`bas-jobs` deliberately only runs when `bas` passed. When the control plane is
down, one alarm for one cause is enough.

**Known gap, close it when the Doug job lands.** `bas-jobs` treats "no active
routines" as OK, because that is the honest state of a box built before its first
job is scheduled. Once a job exists, zero routines is no longer benign: a routine
someone deactivated, or a board that came up blank, would read green. The fix is
to alarm when the routine count drops to zero after having been non-zero. Not
built yet, because until the first routine exists there is nothing to drop from.
Pointing `database.mode` at the real Postgres (see below) removes the blank-board
half of this; the deactivated-routine half is still open.

Because the box does not exist yet, the monitor's own dry run only ever reaches
the skip branch, so the failure branches would otherwise ship unverified.
`scripts/bas-fleet-health-block.test.sh` stubs `curl`, `ssh`, `log` and `check`
and asserts all nine outcomes, including against the copy actually installed on
graphite:

```bash
./scripts/bas-fleet-health-block.test.sh                 # the copy in this repo
BLOCK=/tmp/installed-block.sh ./scripts/bas-fleet-health-block.test.sh
```

To prove the alert path end to end without breaking anything:

```bash
ssh graphite 'FLEET_HEALTH_FORCE_FAIL=bas FLEET_HEALTH_STATE_DIR=$(mktemp -d) \
  bash ~/.paperclip/fleet-health-check.sh'
```

That forces one check to FAIL against a scratch state directory, so real state
is untouched and the next real run does not log a fake recovery.

## Demo test

LAC-4279 is done when all of this is on the ticket:

- [ ] `curl https://bas.hyrax-boga.ts.net/api/health` output (needs the tailnet)
- [x] `systemctl kill -s KILL paperclip` followed by health coming back on its own
- [ ] a fleet-health alert fired on purpose, screenshotted (needs the tailnet)
- [x] the restore log above, re-run with real rows
- [ ] one successful Doug store watch run on this box (needs the AI connection)

The kill test, 2026-10-13, nothing touched it but systemd:

```
pid before: 27197, health: ok
right after SIGKILL: state=activating
recovered: state=active pid=27705 health=ok
pid changed: yes
```

## Traps found during bring-up

All five are fixed in the scripts and guarded by tests. They are written down
because every one of them is silent.

1. **Ubuntu's node is useless here.** 24.04 ships node 18 with no `npm` at all,
   and paperclipai 2026.1005.0 needs node >=24.11. cloud-init installs
   NodeSource 24.
2. **`paperclipai run` refuses to start with no config**, and onboarding is
   interactive by default. Setup runs
   `paperclipai onboard -y --bind loopback --no-install-service` as the
   `paperclip` user first.
3. **onboard always writes `database.mode: embedded-postgres`.** The server does
   honour `DATABASE_URL` over it, so it ran on the real database anyway, but the
   disagreement broke every CLI subcommand (`db:backup` dialled the embedded port
   54329 and failed), and a `DATABASE_URL` that ever went missing would have
   brought the board up as a brand-new empty one, reporting healthy, with the
   real data orphaned. Setup now sets `mode: postgres` so it fails closed.
4. **`systemctl enable` does not start a timer.** `bas-ship-backup.timer` was
   `enabled` while `systemctl list-timers` showed zero timers: the off-box copy
   would never have run until the next reboot. It is `enable --now`.
5. **`StartLimitIntervalSec` and `StartLimitBurst` are `[Unit]` options.** Under
   `[Service]` systemd ignores them with only a log line, so the crash-loop guard
   did nothing.

6. **`issuePrefix` is not settable through the API.** `company create` derived
   `BUI` from the name and ignored the field; `company update` ignored it both
   flat and nested. Fixed with one `update companies set issue_prefix = 'BAS'`,
   safe only because the board had zero issues at the time. Do it before the
   first issue exists, or not at all.
7. **`runtimeConfig.modelProfiles` is rejected** by this version, so there is no
   cheap-model tier to configure. See [Company and roster](#company-and-roster).

Two smaller ones: `$meta.source` in `config.json` is a strict enum
(`onboard`/`configure`/`doctor`) and anything else makes `paperclip doctor` fail
and the service refuse to boot; and `/etc/paperclip` is `0750 root:root` on
purpose, so CLI commands need their environment passed in with `systemd-run`
rather than being readable by the service user.

## What was left out on purpose

Auto-upgrade. The embedded Postgres. Any agent beyond Operator. A public web UI.
A separate launchd job for monitoring. Each one is a thing that breaks quietly.
