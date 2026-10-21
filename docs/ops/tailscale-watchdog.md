# Tailscale watchdog

One job: put zero's own network back when it drops, so the fleet stops going
dark.

`scripts/tailscale-watchdog.sh`, a launchd job on zero every 5 minutes. It
probes the two things an agent needs, repairs the two faults that are
unambiguously machine-fixable, and pages Lacy through
[the dead-man's switch](./fleet-dark-watch.md)'s channel for everything else.

## Why it exists (LAC-5275)

`PAPERCLIP_API_URL` is `https://zero.hyrax-boga.ts.net`, which is this laptop's
own tailnet name. When Tailscale here stops, the laptop cannot reach itself.
Overnight 2026-10-20/21 every Paperclip write from every agent failed for about
six hours, with the control plane answering on loopback the whole time. Two
finished deliverables were stranded as local files. Nothing recovered on its
own and no alarm fired.

## Health is "can this host resolve a public name", not "is Tailscale running"

This is the whole design, and it came from the fix failing.

At 15:10 on 2026-10-21 the CTO brought Tailscale back up by hand with exactly
the flags this watchdog uses. `BackendState: Running`, `Health: []`, peers
visible, `ts.net` resolving. **The fleet was still broken.** Public DNS was
still dead, so every agent would have had a reachable control plane and still
failed every npm, GitHub and Vercel call. A watchdog that watched
`BackendState` would have reported success into a dead fleet.

There are two independent faults on this host, and they hide each other:

| Fault                | What dies    | What still works        |
| -------------------- | ------------ | ----------------------- |
| Tailscale stopped    | `ts.net`     | public DNS, usually     |
| System resolver dead | public names | `ts.net`, via Tailscale |

The second one had been there all along. The tailnet pushes **no resolver of
its own** (`tailscale dns status`: "no resolvers configured, system default will
be used"), only a `ts.net.` split route, so MagicDNS forwards every public name
to the system default. The system default was `10.0.0.243`, a DHCP nameserver
on a network this laptop had left, 100% packet loss. Tailscale running or
stopped, public DNS was dead either way. Stopping Tailscale only removed the
`ts.net` cover that was hiding it.

So the probe has to be able to tell those apart, and "is the daemon running" is
not a probe.

## The two probes

Both are a real HTTP request to a real remote host, through `getaddrinfo`, which
is the path npm, git, curl and node actually use:

```bash
curl https://zero.hyrax-boga.ts.net/api/health   # the tailnet, and the plane behind it
curl https://registry.npmjs.org/-/ping           # the public internet
```

Both must answer. The control-plane probe deliberately does **not** pin the
address with `--resolve`, the way the dead-man's switch has to: pinning would
prove TCP works and hide the MagicDNS failure, which is the thing that takes the
fleet down.

**They are HTTP and not name lookups on purpose.** Anything with a cache fails
open. `npm view` with DNS down serves its offline cache with exit code 0 and no
warning, which is how two runs a minute apart reported different "live" versions
on 2026-10-21, and the only tell was that they disagreed. A 200 from a host
across the internet cannot come out of a local cache. `dig` appears in this
script exactly once and never to declare health: it is used to **attribute** a
failure.

## The repair ladder

Each rung re-probes before the next one is considered.

**Rung 1, the tailnet.** Only on the unambiguous recoverable shape:
`BackendState` not `Running`, `LoggedOut: false`, `HaveNodeKey: true`, `AuthURL`
empty. Then `tailscale up --timeout=30s --accept-routes`, the flags the CLI
itself prints, which preserve the current prefs.

**Rung 2, the system resolver.** Only when the public probe fails **and**
`dig @1.1.1.1 registry.npmjs.org` answers. That difference is the whole
discriminator: it means the names are fine and the internet is fine, so this
host's resolver configuration is the broken part. Then
`networksetup -setdnsservers <service> 1.1.1.1 8.8.8.8`.

Rung 1 runs first because bringing `ts.net` back can restore the public path
too, and a DNS override installed for a fault rung 1 was about to clear would be
an unnecessary change to Lacy's laptop.

### What it will not touch

| Shape                                              | Why not                                                                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LoggedOut: true`, or a non-empty `AuthURL`        | `tailscale up` on a logged-out node does nothing but wait for a browser. Pages instead.                                                                   |
| The CLI does not answer at all                     | The daemon is not listening, so there is nothing to talk to. The 2026-10-21 `NoState` wedge needed a system-extension restart with `sudo`. Pages instead. |
| `BackendState: Running` but the plane is silent    | The fault is not Tailscale's state, so restarting it would be a guess.                                                                                    |
| Public DNS fails **and** `1.1.1.1` is silent too   | The link or the gateway is down, not the resolver config. Rewriting DNS here would be a wrong repair that outlives the outage.                            |
| The default route is not on a configurable service | An exit node can put it on `utun`. Configuring the wrong service is a silent no-op repair, which is worse than no repair.                                 |

## The DNS override is written down, and stays written down

Nothing here ever reverts to DHCP on its own. `10.0.0.243` may be a Pi-hole Lacy
wants back, and that is his call.

When rung 2 fires it records what it did to
`~/.paperclip/tailscale-watchdog/dns-override`, with the service, the new
servers, the previous value and the timestamp. The Slack notice names it. And
**every healthy cycle afterwards repeats it**, so it cannot become a mystery
somebody rediscovers during the next outage. The shape of that line:

```
<time> OK plane and public DNS both answer [dns-override: 1.1.1.1 8.8.8.8 on Wi-Fi since <time>, was 10.0.0.243; undo with networksetup -setdnsservers Wi-Fi empty]
```

No override is installed on zero today, because the CTO already fixed the
resolver by hand on 2026-10-21 and rung 2 only fires on a failing public probe.
That branch is covered by the tests rather than by a capture from this host.

The undo is one command:

```bash
networksetup -setdnsservers Wi-Fi empty   # back to whatever DHCP hands out
```

The service is derived from the interface carrying the default route rather than
hardcoded to `Wi-Fi`, because this laptop is on the Thunderbolt dock often
enough that configuring the wrong service would be a repair that silently does
nothing.

`networksetup -setdnsservers` needs no `sudo` for an admin user, verified on
this host with an idempotent write of the values already set. That was the open
question that would have sunk rung 2.

## When Lacy hears about it

Through the same Slack DM as [the dead-man's switch](./fleet-dark-watch.md) and
[the power watch](./fleet-power-watch.md), reading the same bot token out of
`~/.openclaw/openclaw.json`. Deliberately not a second notifier: one place to
look was the point of LAC-4874.

| What happened                                 | Message                                              |
| --------------------------------------------- | ---------------------------------------------------- |
| First failing cycle                           | none, clock starts                                   |
| Repaired on this cycle                        | one notice naming what it did, at most one per 6h    |
| Three repair attempts failed                  | one page, with what it tried and what it saw         |
| Needs a human (logged out, wedged, link down) | one page at 15 minutes, naming what only Lacy can do |
| Broken 15 minutes for any other reason        | one page with both probe results                     |
| Back up, having paged                         | one recovery message with the duration               |
| Back up, under 15 minutes                     | none, logged as `BLIP`                               |

A successful repair notifies rather than staying silent, which is the one place
this is louder than its siblings. A watchdog that rewrites DNS on the owner's
laptop and says nothing is the mysterious change the CTO asked not to make.
Rate-limited to one notice per 6 hours so a bad afternoon is a couple of
messages rather than a muted channel.

### The pager cannot depend on the thing it reports

The headline failure is "this host cannot resolve public names", and
`slack.com` is a public name. So when `curl` fails with exit 6, could not
resolve host, the notifier asks `1.1.1.1` directly and pins the answer with
`--resolve`. If even that cannot get out, library's dead-man's switch still
pages from off the host, which is the backstop by design.

## Rate caps, so we cannot flap it harder than it is flapping

- **4 minutes** minimum between repair attempts, under the 5-minute interval, so
  a `RunAtLoad` burst or a hand-run loop cannot hammer the fleet's only network
  path.
- **3 consecutive failed attempts** and it stops, pages, and does not try again
  until the host is healthy. The 2026-10-21 wedge was real: `tailscale up`
  returned and the network extension stayed in `NoState`. No number of retries
  was going to change that.
- **6 repairs per hour**, for the fault the attempt counter cannot see. Every
  success resets the attempt counter, so without this second cap a node that
  broke every six minutes would be repaired forever in silence.

## Run it by hand

```bash
bash scripts/tailscale-watchdog.sh                     # probe and log, print what it would do
bash scripts/tailscale-watchdog.sh --repair            # repair for real
bash scripts/tailscale-watchdog.sh --repair --notify   # and DM Lacy when it matters
```

A dry run writes no state at all, so running it during an outage cannot spend
the page, or the repair budget, that a real cycle still owes.

Exit codes: `0` healthy, possibly after a repair this cycle. `1` not healthy.
`2` **this script could not do its job** (missing `curl`, `jq`, `date`, `dig` or
the Tailscale CLI, or nowhere to write). `2` is never reported as `0`, for the
same reason the dead-man's switch keeps them apart: "could not look" and "the
fleet is fine" are different readings and only one of them is good news.

Everything is overridable by environment variable, including the clock and every
external command, so the tests drive fake Tailscale, `networksetup`, `dig` and
`route` binaries and a fake Slack, and a fifteen-minute threshold costs a
millisecond to test: `TS_WATCHDOG_NOW`, `_DIR`, `_FALLBACK_DIR`, `_PLANE_URL`,
`_PUBLIC_URL`, `_PUBLIC_RESOLVER`, `_PUBLIC_CANARY`, `_TIMEOUT`, `_DNS_SERVERS`,
`_PAGE_AFTER`, `_MAX_ATTEMPTS`, `_MIN_REPAIR_GAP`, `_REPAIR_WINDOW`,
`_MAX_REPAIRS_PER_WINDOW`, `_SETTLE`, `_NOTICE_GAP`, `_TAILSCALE`,
`_NETWORKSETUP`, `_DIG`, `_ROUTE`, `_SLACK_CHANNEL`, `_SLACK_TOKEN`,
`_SLACK_TOKEN_FILE`, `_SLACK_API`.

```bash
npx vitest run --config=vitest.config.node.ts tests/node/ops/tailscale-watchdog.test.ts
```

`bun run test:node` is `vitest` without `run`, so it watches rather than exits.

## A full disk must not switch the pager off

Every state write is checked, and the directory is proven by **writing to it**
rather than by `[ -w ]`, which tests a permission bit and misses the failure
that actually happens. If the primary directory refuses, state moves to `/tmp`
and every healthy line says `degraded:` until it is fixed. If there is nowhere
at all, it exits 2 rather than 0.

This is the known silent-watchdog failure mode and it is in the acceptance
criteria for a reason: an unchecked state write plus a full disk means the clock
restarts every cycle, the threshold is never reached, and a twelve-hour outage
produces zero pages and no line saying why. When the state write fails
mid-outage it says so in the channel, because silence is also what a healthy
host looks like.

## Install

```bash
cp docs/ops/tailscale-watchdog.plist ~/Library/LaunchAgents/com.buildandserve.tailscale-watchdog.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.buildandserve.tailscale-watchdog.plist
launchctl list | grep tailscale-watchdog
```

```
~/Library/LaunchAgents/com.buildandserve.tailscale-watchdog.plist   the schedule
~/repo/buildandserve/scripts/tailscale-watchdog.sh                  the script
~/.paperclip/tailscale-watchdog/tailscale-watchdog.log              the log to read
~/.paperclip/tailscale-watchdog/state                               present only during an outage
~/.paperclip/tailscale-watchdog/dns-override                        present only while an override is installed
~/.paperclip/logs/tailscale-watchdog.launchd.log                    launchd's copy of stdout and stderr
```

The plist sets `HOME`, because launchd does not, and the Slack token and the
state directory are both under it. To reload after editing the script, nothing
is needed; after editing the plist:

```bash
launchctl bootout gui/$(id -u)/com.buildandserve.tailscale-watchdog
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.buildandserve.tailscale-watchdog.plist
```

## Proven against the real fault

2026-10-21 on zero, twice, with the job installed and running on launchd's own
5-minute schedule. `tailscale down` reproduces the exact overnight shape:
`BackendState: Stopped`, `WantRunning: false`, `LoggedOut: false`,
`HaveNodeKey: true`, `AuthURL` empty.

Second run, against the shipped code. Taken down at 12:09:42, caught and fixed
by the next scheduled cycle without anybody touching it:

```
12:09:37 OK plane and public DNS both answer
12:14:38 BROKEN tailnet plane[http=000 curl: (6) Could not resolve host: zero.hyrax-boga.ts.net] public[http=200] for 0m
12:14:38 LADDER rung 1, tailnet is down in the recoverable shape: BackendState=Stopped LoggedOut=false HaveNodeKey=true AuthURL=empty
12:14:39 REPAIR tailscale up returned ok
12:14:43 RE-PROBE plane ok
12:14:43 FIXED tailscale up; healthy again, was broken for up to 5m (last healthy check 12:09 EDT)
12:14:43 QUIET fixed it, and the last notice was 8m ago, under the 6h00m gap
```

Five seconds from detection to healthy, and `/api/agents/me` over
`https://zero.hyrax-boga.ts.net` answered 200 afterwards. The `QUIET` line is
the notice cap working: the first proof run an hour earlier had already
delivered a real Slack DM, so the second repair was logged and not sent.

The first run is where the duration wording came from. It said "healthy again
after 0m" about a fleet that had been unreachable for 4m46s, because the stop
happened seconds after a healthy cycle and the watchdog measured from the
moment it noticed. The number it reports now is bounded by the last healthy
check, which is the earliest moment the host was provably fine.

## Deliberately not here

- **No `sudo`.** A wedged network extension needs one and that is a human's
  job. A watchdog with root on the fleet's only network path is a worse problem
  than the one it solves.
- **No second notifier.** Slack is where the sibling watches already page.
- **No auto-revert to DHCP DNS.** See above: that is Lacy's call, not a
  script's.
- **No host guard.** This is a zero-only job because the plane it probes is
  zero's own name. Copying it to another host would be a misinstall, and a check
  for a situation that does not exist is a check nobody maintains.
- **No lock file.** A cycle costs at most ~20s against a 300s interval, and the
  state file only matches complete numeric lines, so a torn write reads as
  absent. A stuck lock would silence this permanently.

## Known gaps

- **It cannot fix the `NoState` wedge**, which is the fault that started this.
  It detects it, stops after three attempts and pages. The restart needs `sudo`
  and is escalated on LAC-4878.
- **It runs on the host it watches.** If zero is asleep, off, or at the
  FileVault prompt, this is dead too. That blind spot is
  [the dead-man's switch](./fleet-dark-watch.md)'s job, which is why this one
  pages through the same channel rather than inventing a second signal.
- **A repair it cannot verify is still reported as a failure.** If both probes
  stay broken for a reason outside these two faults, the ladder runs, fails, and
  pages. That is the intended direction: a watchdog that assumed a repair worked
  is the thing this file refuses to be.
- **It does not watch the work.** A host with a healthy network while every run
  fails is invisible here. That is
  [the stranded-work watch](./paperclip-stranded-watch.md)'s job.

## Delete it when

The control plane no longer runs on one laptop (LAC-4279/LAC-4878). Moving it to
`library` removes the self-reference absurdity but **not** this failure mode:
agents still run on zero, so a library control plane is still unreachable from
zero with Tailscale down. The two are complementary. What retires this is agents
not running on a laptop whose network nobody is watching.
