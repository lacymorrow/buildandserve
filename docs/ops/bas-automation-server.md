# BAS automation server

The box that runs Build and Serve client automations. Pinned Paperclip on
Hetzner, real Postgres, backups off the box, watched from somewhere else.

Ticket: LAC-4279. First job it will run: [Doug store watch](./doug-store-watch.md).

## Status

**Not provisioned yet.** The location is an open spend decision, see
[Location and cost](#location-and-cost). Everything that costs nothing is
already in place:

| Thing | State |
|---|---|
| Hetzner project | BAS Automation (16372856), separate from the production project so this token cannot touch prod |
| ssh keys | `bas-zero-lacy` (131232206), `bas-graphite-fleet-health` (131232207) |
| Firewall | `bas-automation` (11789519): inbound tcp/22, udp/41641, icmp. Nothing else. |
| Monitoring | installed on graphite, skipping until the box exists |
| Server | not created |

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

Hetzner's live prices on 2026-10-12, CPX31 (4 vCPU, 8 GB, 160 GB):

| Location | Price |
|---|---|
| Falkenstein (`fsn1`) | EUR 20.49/mo |
| Ashburn (`ash`) | EUR 73.49/mo |

The ticket asked for CPX31, in Ashburn, at about EUR 15/mo. Those three can no
longer all be true: US locations now carry a roughly 3.5x premium across every
shared type, and the EUR 15 figure is the old EU price. Ashburn costs EUR 881/yr
against EUR 246/yr for Falkenstein.

Falkenstein is the recommendation. The workload is agent heartbeats plus
read-only HTTPS fetches of client sites every 4 hours, so EU-versus-US latency
does not matter, backups go to the library NAS over Tailscale from anywhere, and
only public-site monitoring data lives on the box, so no client PII crosses a
border. The decision is Lacy's and is pending on LAC-4279.

`bas-provision.sh` has no default location on purpose. It refuses to run until
you pass one, because that argument is what sets the monthly bill.

## Build

```bash
# 1. create the server (BAS_LOCATION is mandatory)
BAS_LOCATION=fsn1 ./scripts/bas-provision.sh

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

Then create the company: **Build and Serve**, prefix `BAS`, with one agent,
**Operator**, on `claude-opus-5` with `cheap` set to `claude-sonnet-5-5`.
Not `claude-opus-5-5`: the bundled Claude Code (2.1.257) rejects it, which is
why the whole fleet sits on Opus 5. Nothing else goes on the roster yet.

## Upgrading

Not automatic, and not a surprise.

1. Check the version has been running on zero for 3+ days.
2. `ssh root@bas 'npm install -g paperclipai@<version> && systemctl restart paperclip'`
3. Update `PAPERCLIP_VERSION` in `scripts/bas-setup.sh` and the pin in this file.
   A test asserts those two agree, so a drifting pin fails CI.
4. Watch `/api/health` and the next job run before walking away.

## Backups and restore

Paperclip writes its own dumps to `/var/backups/paperclip` every 24 hours, which
is what makes `/api/health` report a backup age the outside monitor can check.
`bas-ship-backup.timer` then copies the newest dump to
`library:/mnt/user/backups/paperclip-bas/` at 03:30 and keeps 14 there. A backup
that only exists on the box it is backing up is not a backup.

Restore test, which has to be run once and the output pasted on LAC-4279:

```bash
# on the box, into a scratch database, never over the live one
ssh root@bas
newest=$(ls -t /var/backups/paperclip/* | head -1)
su - postgres -c "createdb paperclip_restore_test"
su - postgres -c "pg_restore -d paperclip_restore_test --no-owner '$newest'" \
  || su - postgres -c "gunzip -c '$newest' | psql -d paperclip_restore_test"
su - postgres -c "psql -d paperclip_restore_test -At -c \
  \"select count(*) from information_schema.tables where table_schema='public'\""
su - postgres -c "dropdb paperclip_restore_test"
```

A restore that has never been tried is a guess, not a backup.

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

To prove the alert path end to end without breaking anything:

```bash
ssh graphite 'FLEET_HEALTH_FORCE_FAIL=bas FLEET_HEALTH_STATE_DIR=$(mktemp -d) \
  bash ~/.paperclip/fleet-health-check.sh'
```

That forces one check to FAIL against a scratch state directory, so real state
is untouched and the next real run does not log a fake recovery.

## Demo test

LAC-4279 is done when all of this is on the ticket:

- [ ] `curl https://bas.hyrax-boga.ts.net/api/health` output
- [ ] `systemctl kill -s KILL paperclip` followed by health coming back on its own
- [ ] a fleet-health alert fired on purpose, screenshotted
- [ ] the restore log above
- [ ] one successful Doug store watch run on this box

## What was left out on purpose

Auto-upgrade. The embedded Postgres. Any agent beyond Operator. A public web UI.
A separate launchd job for monitoring. Each one is a thing that breaks quietly.
