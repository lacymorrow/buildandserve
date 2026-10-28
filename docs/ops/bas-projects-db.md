# projects-db on the bas box

Self-hosted Postgres for project databases, so projects stop burning Neon compute
hours. Built by LAC-5979 under LAC-5969, certificate verification added by
LAC-6054, taken off the public port for everything but Vercel by LAC-6059.

|           |                                                                                 |
| --------- | ------------------------------------------------------------------------------- |
| Host      | `projects-db.cloud0.dev:26432` → `128.140.50.130` (bas box, Hetzner cx33, Falkenstein) |
| Container | `projects-db`, `postgres:17-alpine`, `--restart unless-stopped`, 1 GB cap       |
| Data      | `/data/projects-db/data` (bind mount, plain directory on `/`)                   |
| Config    | `/data/projects-db/conf` → `/pgconf:ro` (cert, key, `pg_hba.conf`)              |
| Auth      | `scram-sha-256` over TLS, required from off-box, server cert verified            |
| Cert      | Let's Encrypt on `projects-db.cloud0.dev`, renewed by `certbot.timer`           |
| Script    | `scripts/bas-projects-db.sh`, installed at `/usr/local/sbin/bas-projects-db.sh` |
| Watch     | `scripts/bas-projects-db-watch.sh` on zero, hourly, silent when healthy         |
| Checks    | served cert, auth failures from off-tailnet, secret file modes                  |
| Secrets   | zero, `~/.paperclip/secrets/<project>-db.env`, mode 600                         |
| Ops       | over the tailnet: `bas.hyrax-boga.ts.net` = `100.117.119.81` (LAC-6059)         |
| Limits    | `authentication_timeout` 10s, 20 concurrent and 10/s new per source address     |
| ssh       | tailnet only, plus one allowlisted host (see "ssh is tailnet-only")             |

It is deliberately a separate container from the Paperclip Postgres 16 cluster on
`127.0.0.1:5432`. That cluster runs the BAS client control plane, and a runaway
project query must not be able to starve it.

## The TLS-only guarantee

`pg_hba.conf` has no `host` line for any non-loopback address. A plaintext
connection from off-box therefore has no matching rule at all and is refused
before authentication, rather than merely discouraged.

```
local   all                  all                  trust
host    all                  all                  127.0.0.1/32 trust
host    all                  all                  ::1/128      trust
hostssl keepsake             keepsake             all          scram-sha-256
hostssl shipkit_www          shipkit_www          all          scram-sha-256
hostssl gracefully_imagined  gracefully_imagined  all          scram-sha-256
```

One `hostssl` line per project, never `hostssl all all all`. The `umami-db`
container this one is modelled on uses the wildcard form; on a multi-tenant box
that means a leaked keepsake password reaches the shipkit database.

Re-measured 2026-10-28 from zero (`107.141.224.67`) at `verify-full`, all four
confirmed:

| Attempt                                          | Result                                  |
| ------------------------------------------------ | --------------------------------------- |
| `keepsake` → `keepsake`, `verify-full`           | connects                                |
| `keepsake` → `keepsake`, `sslmode=disable`       | `no pg_hba.conf entry … no encryption`  |
| `keepsake` → `shipkit_www`, `verify-full`        | `no pg_hba.conf entry … SSL encryption` |
| `postgres` → `postgres`, `verify-full`           | `no pg_hba.conf entry … SSL encryption` |

One client-side surprise worth knowing, because it looks like a server refusal
and is not: libpq 18 rejects `sslmode=disable` on its own, before it opens a
socket, when `sslrootcert=system` is set (`weak sslmode "disable" may not be used
with sslrootcert=system`). To see the server's own refusal of plaintext, unset
`PGSSLROOTCERT` first.

The superuser is not reachable from off-box. Reach it over ssh, which matches the
`local … trust` line:

```bash
ssh root@bas.hyrax-boga.ts.net docker exec -it projects-db psql -U postgres
```

Vercel egress has no fixed IP range, so there is no source allowlist on
`tcp/26432` (Hetzner firewall `bas-automation`, id 11789519). Scram and one hba
line per database are the whole access control story, so treat a leaked project
password as a full compromise of that one database.

Certificate verification does not change that, and it is worth being precise
about what it did buy. It authenticates the **server** to the client, which
closes the relay attack: before LAC-6054 an on-path attacker could present any
certificate, be accepted, and pass the SCRAM exchange through to the real server.
It is not access control and it keeps nobody out. Client certificates are
LAC-6060. LAC-6056 ruled that the port stays world-open for Vercel and LAC-6059
did the rest: everything that is not a Vercel function left the port, and the
port stopped being free to abuse. See "Ops runs over the tailnet" and "Pre-auth
connection limits" below.

## One URL, every driver

```
postgresql://<role>:<pw>@projects-db.cloud0.dev:26432/<db>?sslmode=verify-full
```

That string is what the secret files hold and what every app uses. No per-driver
spelling, no code change, nothing to remember.

`verify-full` means the client checks that the server's certificate chains to a
trusted root **and** that it names the host being connected to. Without it, TLS
here bought encryption and no server authentication at all: an on-path attacker
could present any certificate, the client would take it, and the attacker could
relay the SCRAM exchange to the real server and sit inside an authenticated
session. Channel binding would stop that relay and neither driver can do it
(`postgres` 3.4.9 has no support; `pg` 8.20.0 has it only as the non-URL,
best-effort `enableChannelBinding`). Certificate verification is the only
mechanism available, so it is not optional here.

**Connect to the name, never the IP.** postgres-js sets
`servername: net.isIP(socket.host) ? undefined : socket.host`
(`src/connection.js:277`), so against a bare IP it sends no SNI, Node compares
the certificate against an empty host, and `verify-full` can never pass no
matter who issued the cert. Both Node drivers fail this way, measured below.

**Never put `sslrootcert` in the URL.** postgres-js forwards query parameters it
does not recognise to the server as startup settings, so the connection dies
with `unrecognized configuration parameter "sslrootcert"`. The Node drivers do
not need it: they verify against Node's built-in CA bundle.

`psql` is the one exception, and it is a command-line flag rather than a change
to the stored URL. libpq looks for a root certificate at `~/.postgresql/root.crt`
by default, not in the system trust store, so it needs to be pointed at the
system store once:

```bash
export PGSSLROOTCERT=system     # libpq 16+; or append &sslrootcert=system by hand
psql "$DATABASE_URL" -c 'select 1'
```

### Measured 2026-10-28 from zero, against the live container

Verification is genuinely on, not merely requested. Each driver is checked twice:
once that the good path connects, and once that a deliberately broken path is
refused. A check that only ever passes proves nothing.

| Client                       | Case                                     | Result                                                          |
| ---------------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| `postgres` (postgres-js) 3.4.9 | hostname, `verify-full`                 | connects                                                        |
| `postgres` (postgres-js) 3.4.9 | hostname, a CA that did not sign it     | fails, `unable to get local issuer certificate`                 |
| `postgres` (postgres-js) 3.4.9 | bare IP, `verify-full`                  | fails, `Host: localhost. is not in the cert's altnames`         |
| `postgres` (postgres-js) 3.4.9 | `&sslrootcert=system` in the URL        | fails, `unrecognized configuration parameter "sslrootcert"`     |
| `pg` (node-postgres) 8.20.0  | hostname, `verify-full`                  | connects                                                        |
| `pg` (node-postgres) 8.20.0  | hostname, a CA that did not sign it      | fails, `unable to get local issuer certificate`                 |
| `pg` (node-postgres) 8.20.0  | bare IP, `verify-full`                   | fails, `Host: localhost. is not in the cert's altnames`         |
| `psql` / libpq 18.6          | `verify-full` + `sslrootcert=system`     | connects                                                        |
| `psql` / libpq 18.6          | `verify-full`, no `sslrootcert`          | fails, `root certificate file … does not exist`                 |
| `psql` / libpq 18.6          | `verify-full` + an empty root file       | fails, could not read certificate                               |
| `psql` / libpq 18.6          | bare IP, `verify-full`                   | fails, `server certificate for "projects-db.cloud0.dev" … does not match host name` |

The two "a CA that did not sign it" rows are the ones that matter. They prove the
Node drivers check the chain, rather than checking the hostname and trusting
whatever root happens to be offered.

All three project roles connect with their stored URL verbatim, `ssl=true` in
`pg_stat_ssl`: `keepsake`, `shipkit_www`, `gracefully_imagined`.

## The certificate

|            |                                                                        |
| ---------- | ---------------------------------------------------------------------- |
| Name       | `projects-db.cloud0.dev` (Cloudflare zone `cloud0.dev`, DNS-only, A → `128.140.50.130`) |
| Issuer     | Let's Encrypt, ECDSA P-256, 90 days                                    |
| Issued     | 2026-10-28, expires 2027-01-26                                         |
| Lineage    | `/etc/letsencrypt/live/projects-db.cloud0.dev`                         |
| Served as  | `/data/projects-db/conf/server.crt` (fullchain, `644`) and `server.key` (`600`), both `70:70` |
| Challenge  | HTTP-01 standalone, `tcp/80` on Hetzner firewall `11789519`            |
| Renewal    | `certbot.timer` (apt, twice daily) → deploy hook → `pg_reload_conf()`  |
| Watch      | `scripts/bas-projects-db-watch.sh`, at most once every 20h          |

The hostname is mandatory rather than cosmetic: see the SNI note above. It lives
in `cloud0.dev` and not `buildandserve.com` deliberately, because DNS edit rights
on `buildandserve.com` also control the Email Routing MX records.

**HTTP-01, not DNS-01.** DNS-01 would avoid opening a port, but it needs a
Cloudflare DNS-edit token sitting on an internet-exposed box for every future
renewal. An open `tcp/80` with nothing listening behind it between renewals is
the smaller exposure, so that is the trade taken. certbot binds port 80 for the
few seconds a challenge takes and releases it.

**No Let's Encrypt account email, on purpose.** `admin@buildandserve.com` is a
Cloudflare routing address with no mailbox, so LE expiry warnings would be
delivered nowhere and would read as coverage that does not exist. The watch below
is the alarm that reaches a person.

### Renewal, and the one way it fails quietly

`certbot.timer` renews at 30 days remaining. The deploy hook at
`/etc/letsencrypt/renewal-hooks/deploy/projects-db.sh` is a shim onto
`bas-projects-db.sh cert-deploy`, so the logic has one home. It copies
`fullchain.pem` and `privkey.pem` into `/data/projects-db/conf` as `70:70` with
the key at `600`, then calls `pg_reload_conf()`. Postgres rereads the cert on
reload; there is no restart and no dropped connection.

Two details worth keeping:

A reload that cannot read the new key keeps the **old** TLS context and only
writes a log line, so a zero exit from the reload is not proof that anything
changed. `cert-deploy` reads the served certificate back and compares
fingerprints before it reports success.

If the hook itself fails, certbot will not retry it, because the certificate is
already fresh. The box then serves the old certificate until it expires, with a
new one sitting on disk and nothing complaining. That is why the watch measures
the cert the server **serves** rather than the files on disk: this fault then
shows up as ordinary expiry, weeks ahead.

### Expiry monitoring

```bash
scripts/bas-projects-db-watch.sh            # from zero, read-only, no credentials
ssh root@bas.hyrax-boga.ts.net /usr/local/sbin/bas-projects-db.sh cert-check   # on the box
```

Both are silent and exit 0 when healthy. Exit 1 is a problem with the reason
printed; exit 3 means the run could not prove anything (this host could not do
DNS) and is explicitly not an incident, the same ruling LAC-5278 made for the
store watch.

The watch runs over the public name and the public port, so it also covers a
deleted DNS record, a closed firewall port and a stopped container. It holds no
database password: it reads the certificate with
`openssl s_client -starttls postgres`, which needs no login. Threshold is 21 days
remaining, because certbot renews at 30 and its timer runs twice a day, so
anything below 21 means the renewal path has been failing for weeks.

The same job carries the auth-failure check (see "Authentication-failure
alerting"), which is why it runs hourly while the cert half runs at most once
every `CERT_EVERY_HOURS` (20). The stamp file at
`~/.paperclip/state/projects-db-cert-checked-at` is what keeps the two cadences
apart, and it is a stamp rather than a fixed hour of the day on purpose: this
runs on a laptop that sleeps, and a fixed hour is a cert check silently skipped
on every day the lid was shut at the wrong moment. `--cert-now` forces it.

Install the schedule (after this branch is on `main`, because a launchd job must
not point at a script that only exists on a branch):

```bash
cp docs/ops/bas-projects-db-watch.plist ~/Library/LaunchAgents/com.buildandserve.projects-db-watch.plist
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.buildandserve.projects-db-watch.plist
launchctl print gui/$UID/com.buildandserve.projects-db-watch | grep -E 'runs|last exit'
```

Verify by the `launchctl print` run count and exit code, never by the log tail:
the log is empty when everything is fine.

## Ops runs over the tailnet

LAC-6056 ruled that `tcp/26432` stays open to `0.0.0.0/0` because Vercel egress
has no fixed IP range. That ruling is about Vercel. Nothing else has any reason
to be on that port, so LAC-6059 took everything else off it.

Each secret file therefore carries two URLs, not one:

| Variable           | Host                     | Mode          | Who uses it                           |
| ------------------ | ------------------------ | ------------- | ------------------------------------- |
| `DATABASE_URL`     | `projects-db.cloud0.dev` | `verify-full` | the app, from Vercel                  |
| `OPS_DATABASE_URL` | `bas.hyrax-boga.ts.net`  | `require`     | dumps, restores, migrations, `psql`   |

```bash
set -a; . ~/.paperclip/secrets/keepsake-db.env; set +a
pg_dump --format=custom --file=keepsake.dump "$OPS_DATABASE_URL"
```

The ops URL needs no `PGSSLROOTCERT`, which is the one ergonomic win here.

### Why the ops URL is `require` and not `verify-full`

The LAC-6054 certificate is issued for `projects-db.cloud0.dev`, so it cannot
match the tailnet name and `verify-full` can never pass against it. Two ways out,
and this is the one that was taken, written down because the other one looks
tidier at first glance:

- **Rejected:** a `/etc/hosts` entry on every ops machine pointing
  `projects-db.cloud0.dev` at `100.117.119.81`. It keeps one URL shape and keeps
  `verify-full`. It is also per-host state that nothing tests and nothing
  reconciles, it has to be repeated on every new ops machine, and it removes the
  public fallback on exactly the day tailscale is the thing that is broken. A
  tailnet-wide split-DNS override is worse still: it would reach every device on
  the tailnet, Lacy's phone included.
- **Taken:** `sslmode=require` on the ops URL only. WireGuard has already
  authenticated both ends of anything arriving from `100.64.0.0/10`, which is
  the property `verify-full` would have been buying. The app URL is untouched and
  stays at `verify-full`.

If MagicDNS is down, substitute `100.117.119.81` for the host. The tailnet
address is stable for the life of the node.

### The superuser never crosses a network

`pg_hba.conf` has no line for the `postgres` role from any address, tailnet
included, and must not grow one. Superuser access is the `local … trust` line,
reached through the container:

```bash
ssh root@bas.hyrax-boga.ts.net docker exec -it projects-db psql -U postgres
```

## Pre-auth connection limits

`max_connections` is 100 and `superuser_reserved_connections` is 3, so there are
97 usable slots shared by every project on the box. The problem LAC-6059 fixed is
that reaching those slots needs no credential at all:

> Postgres reserves the backend slot at fork and checks the role's `CONNECTION
> LIMIT` only after authentication succeeds.

So the per-role `CONNECTION LIMIT` every project role carries (see "Connection
limits" below for the current values) stops a runaway app and stops nothing
else. One internet host that opens 97 TCP
sessions and never finishes a SCRAM exchange takes all five project databases
down for as long as it keeps doing it, authenticates as nobody, and leaves no log
line naming anyone. Measured before the fix: `authentication_timeout` was 60s, so
97 sockets and a loop was the entire attack.

Two levers, both applied:

| Lever                                 | Before | After                              |
| ------------------------------------- | ------ | ---------------------------------- |
| `authentication_timeout`              | 60s    | 10s                                |
| concurrent sessions per source address | none   | 20, `REJECT` with a TCP reset      |
| new connections per source address     | none   | 10/s, burst 20, `REJECT`           |

`authentication_timeout` is a `-c` flag on the container command, so it survives
a restart but not a `docker run` built from an older copy of
`scripts/bas-projects-db.sh`. The rate limits live in
`scripts/bas-projects-db-ratelimit.sh`, installed at
`/usr/local/sbin/bas-projects-db-ratelimit.sh` and held in place by
`projects-db-ratelimit.service`.

`max_connections` was deliberately not raised to compensate. The container has a
1 GB cap and each backend costs memory; the rate limit is the cheaper lever and
the one that addresses the actual cause.

### Three traps, all of them load-bearing

**A Docker published port is DNAT'd before the host filter chain.** `ufw deny
26432` applies cleanly, reports success, and does nothing. Only `DOCKER-USER` or
the Hetzner firewall `bas-automation` (id `11789519`) can affect this port.

**Inside `DOCKER-USER` the destination port is already 5432.** DNAT happens in
`nat/PREROUTING`, which runs before `filter/FORWARD`. A `--dport 26432` rule here
installs successfully, shows up in the chain, and matches nothing, forever. The
rules match `-m conntrack --ctorigdstport 26432`, which reads the pre-DNAT tuple
conntrack remembers. If you ever see the jump rule's counter sitting at zero
while traffic is obviously flowing, this is why.

**A published port on `[::]` bypasses all of it.** Docker's bridge has IPv6
disabled, so there was no `ip6` DNAT rule and IPv6 traffic to `26432` went
through `docker-proxy` in userspace instead: no `DOCKER-USER`, no rate limit, and
every connection arriving at Postgres as `172.17.0.1` with the real source lost,
which would also have blinded the auth-failure watch. LAC-6059 closed it twice
over: the container publishes `-p 0.0.0.0:26432:5432` so the `[::]` listener is
gone, and the Hetzner rule for `26432` dropped `::/0`. `projects-db.cloud0.dev`
has no `AAAA` record, so no client ever used that path.

### Reading and tuning the limits

```bash
ssh root@bas.hyrax-boga.ts.net /usr/local/sbin/bas-projects-db-ratelimit.sh show
```

The counters are the whole diagnostic. A non-zero counter on either `REJECT` rule
means something was turned away; `CONCURRENT=…` or `RATE=…` in front of
`… install` changes a limit, and `systemctl restart projects-db-ratelimit` puts
the defaults back.

The tailnet returns before either limit, so a `pg_dump` opening connections in a
burst is never throttled. One caveat worth knowing: `xt_connlimit` counts
conntrack entries by source address, not by port, so a source with sessions open
to another port on this box has those counted too. Only `22`, `80` and ICMP are
otherwise reachable, so the effect is academic here, but it is not zero.

`REJECT --reject-with tcp-reset`, not `DROP`, and that is deliberate. The clients
on this port are Vercel functions on a wall-clock timeout: a dropped SYN makes a
legitimate but bursty caller hang until its own timeout expires and burn the
function's whole budget, where a reset fails in milliseconds and lets the driver
retry. The attack being defended against is exhaustion, and a reset frees the
slot just as well as a drop does.

### Measured 2026-10-28 from zero

zero reaches `projects-db.cloud0.dev` over the public internet as
`107.141.224.67` and reaches `100.117.119.81` over the tailnet, so one machine
tests both sides.

| Case                                                | Result                                               |
| --------------------------------------------------- | ---------------------------------------------------- |
| one app connection, `verify-full`, public name       | connects                                             |
| 40 concurrent sockets, public name                  | 20 established, 20 reset (`connlimit` counter 20)    |
| 40 concurrent sockets, tailnet address              | 40 established, 0 reset (tailnet `RETURN` counter 160 packets) |
| 80 connects at 311/s, public name, concurrency lifted | 21 established, 59 reset (`hashlimit` counter 59)   |
| `pg_dump` of `gracefully_imagined` over the tailnet  | 419 objects, 155K, server saw client `100.86.145.8`, TLSv1.3 |

### Is 20 concurrent per source enough? Measured 2026-10-28

The LAC-6061 security read passed this but flagged one unknown: 20 concurrent
per source address is untested against real Vercel egress, which may be shared
NAT. Measured two hours after the rules went in, on a normal weekday hour:

| | |
| --- | --- |
| `connection received` in one hour | 195 |
| of those, authorized | 150 |
| `FATAL` (auth failures) | 11 |
| busiest real client, concurrent backends | 1 |
| `connlimit` rejects since install | 0 |
| `hashlimit` rejects since install | 0 |

Vercel arrives from several AWS addresses (`98.83.39.124`, `54.81.38.44`) at one
or two connections each, nowhere near the cap. Neither limit has turned away a
single legitimate connection.

That is a reassuring number and a weak one: only `gracefully_imagined` is live
on this box today. The cap is not proven until keepsake and shipkit-www cut over
and a cold start opens a pool from one egress IP. **The counter is the test.**
Check it after each cutover, and raise `CONCURRENT` if real clients are being
reset:

```bash
ssh root@bas.hyrax-boga.ts.net /usr/local/sbin/bas-projects-db-ratelimit.sh show
```

### The port is being scanned right now, and the watch will never tell you

Of those 195 connections, roughly 20 an hour were internet scanners:

```
[1425] LOG:  connection received: host=172.104.209.135 port=38128
[1425] LOG:  could not accept SSL connection: no application protocol
```

They complete a TCP connect, fail ALPN, and vanish. They never send a startup
packet, so they produce **no `FATAL` at all** and the auth-failure check above
cannot see them by design. Do not read a silent watch as "nothing is touching
the port".

This is the attack the connection limits exist for, not the password guessing.
A scanner that held its sockets open instead of dropping them is the 97-slot
exhaustion from the top of this runbook, and what bounds it is
`authentication_timeout=10s` and the concurrency cap, neither of which needs
anyone to be alerted. To see the scanners:

```bash
ssh root@bas.hyrax-boga.ts.net \
  'docker logs --since 1h projects-db 2>&1 | grep "could not accept SSL connection"'
```

## Authentication-failure alerting

`log_connections` was on from the day the box was built and nothing read it.
`tcp/26432` is world-open, so SCRAM is the only thing between the internet and
five project databases, and a password being guessed at produced exactly as much
noise as a quiet night. The hourly watch now counts two FATALs from sources
outside the tailnet over the last hour:

| Line                             | What it means                                            |
| -------------------------------- | -------------------------------------------------------- |
| `password authentication failed` | someone has a role name and is trying passwords, or an app is deployed with a stale one |
| `no pg_hba.conf entry`           | someone is reaching for a database or a role that is not theirs, which is enumeration rather than a typo |

Over `AUTH_FAIL_THRESHOLD` (default 20/hour) it prints and, with `--notify`,
Slacks. Legitimate traffic produces zero, so both causes are worth the same page.

```bash
scripts/bas-projects-db-watch.sh                      # from zero, hourly by launchd
AUTH_FAIL_THRESHOLD=0 scripts/bas-projects-db-watch.sh --auth-only   # see everything
```

Two details that are easy to get wrong:

**Postgres does not put the client address on the failure line.** It is on the
`connection received` line logged earlier for the same backend PID, so the two
have to be correlated by PID. `no pg_hba.conf entry` carries its own host. A
failure whose `connection received` line fell outside the window is dropped
rather than attributed to the wrong source.

**`logging_collector` is off, so this reads `docker logs --since`.** That makes
the container's json-file log load-bearing, which is why LAC-6059 capped it at
`max-size=10m max-file=5`. It was uncapped: a brute-force burst could have filled
the 75 GB disk, which is its own outage, caused by the very thing the watch is
there to report.

The auth check reads the log over the tailnet by ssh. If the tailnet is down it
exits 3 (void) rather than paging, because the cert check runs over the public
internet and will say so if the box is genuinely gone.

## Secret file modes

The watch's third check, and the cheapest one: every `~/.paperclip/secrets/*-db.env*`
must be mode `600`. These files hold plaintext passwords for databases on a port
open to `0.0.0.0/0`, so the mode is the whole protection. It reads no file and
logs no content, only the name and the mode it found.

It is scoped to `*-db.env*` on purpose. A sweep of every secret on this host is
a different job and belongs with `cred-scrub`, which does not check modes today.

See "Editing a secret file, and the mode trap" for the failure that put this
here and the `install -m 600` idiom that avoids it.

## ssh is tailnet-only

`tcp/22` was `0.0.0.0/0` on firewall `11789519`, and that rule's own description
said it was there to join tailscale "before lockdown". The lockdown never
happened. It was attracting **6,085 failed authentication attempts in 14 days**
against a box that carries the BAS client control plane.

The rule now allows exactly one source, and it is not the tailnet:

```
tcp/22  in  178.156.130.157/32
```

Tailnet ssh does not need a rule at all, and this is the thing to understand
before editing it. Tailscale traffic arrives inside WireGuard on `udp/41641`, or
via a DERP relay on an outbound connection; by the time it is `tcp/22` it is
already inside the host. A `tcp/22` rule scoped to `100.64.0.0/10` would be a
rule that can never match, which is a worse kind of documentation than none.

### Why one host is allowlisted

`178.156.130.157` is the build-and-serve box, and it runs the dead-man check for
Doug's morning shipping run (`keesler-stores/tph/deadman/ship-deadman.sh`). It
lives on a different server **on purpose**, so that it still works when this box
is down, which also means it cannot be on the tailnet for this and still be
doing its job.

Locking it out would not have failed quietly. The script treats an unreachable
box as an incident, so every weekday at 8:55 Denver it would have posted "Can't
reach the shipping box to check this morning's run" to Doug's Discord and
@-mentioned Lacy. Check for callers on the public IP before narrowing this rule
again:

```bash
ssh root@bas.hyrax-boga.ts.net 'journalctl -u ssh --since "30 days ago" --no-pager \
  | grep -oE "Accepted [a-z]+ for [a-z0-9_-]+ from [0-9a-f.:]+" \
  | awk "{print \$4, \$6}" | sort | uniq -c | sort -rn'
```

The exposure that remains is narrow: the key in `/home/ship/.ssh/authorized_keys`
is `command="/usr/local/bin/ship-alive",restrict`, so that host can run one
command and nothing else.

### Break-glass, if the tailnet is gone

Read this before changing anything about `tcp/22`, and note that the Hetzner web
console on its own is **not** a way in: `passwd -S root` reports `L`, the root
password is locked, and there is nothing to type at a console prompt.

The working paths, in the order to try them, none of which depend on the box
being reachable:

1. **Re-open `tcp/22` from the Hetzner Cloud console or API.** The firewall is
   managed entirely off the box, so this works even when the box is wedged, and
   it is one call. Credential: `~/.paperclip/secrets/hetzner-cloud-token` on
   zero, server id `169986608`, firewall id `11789519`.

   ```bash
   TOKEN=$(tr -d '\n' < ~/.paperclip/secrets/hetzner-cloud-token)
   curl -sS -X POST "https://api.hetzner.cloud/v1/firewalls/11789519/actions/set_rules" \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     --data @firewall-rules-with-ssh.json
   ```

   `set_rules` **replaces every rule**, so send the complete set. The current set
   is in this runbook under "Firewall rules" and is readable with
   `GET /v1/firewalls/11789519`.

2. **Reset the root password, then the noVNC console.** `POST
   /v1/servers/169986608/actions/reset_password` returns a new root password and
   reboots the server. This needs step 1 for nothing, but it does reboot.

3. **Rescue mode.** `POST /v1/servers/169986608/actions/enable_rescue` then
   `reboot`. Rescue sshd listens on the public `tcp/22`, so this needs step 1
   first. `rescue_enabled` is `false` today.

### Firewall rules

Measured 2026-10-28, after LAC-6059:

| Proto | Port    | Source                        | Why                                                      |
| ----- | ------- | ----------------------------- | -------------------------------------------------------- |
| tcp   | `22`    | `178.156.130.157/32`          | the off-tailnet dead-man check, forced-command key only   |
| udp   | `41641` | `0.0.0.0/0`, `::/0`           | tailscale direct wireguard; without it everything falls back to DERP |
| icmp  | —       | `0.0.0.0/0`, `::/0`           | so reachability can be distinguished from a dead service  |
| tcp   | `26432` | `0.0.0.0/0`                   | projects-db for Vercel (LAC-6056). No `::/0`: see the third trap above |
| tcp   | `80`    | `0.0.0.0/0`, `::/0`           | certbot HTTP-01; nothing listens here between renewals    |

## Add a database

```bash
PROJ=my_project   # lowercase, [a-z][a-z0-9_], underscores not hyphens
PW=$(openssl rand -hex 24)
printf '%s\n' "$PW" | ssh root@bas.hyrax-boga.ts.net "/usr/local/sbin/bas-projects-db.sh add-project $PROJ"

umask 077
cat > ~/.paperclip/secrets/${PROJ//_/-}-db.env <<EOF
DATABASE_URL=postgresql://$PROJ:$PW@projects-db.cloud0.dev:26432/$PROJ?sslmode=verify-full
OPS_DATABASE_URL=postgresql://$PROJ:$PW@bas.hyrax-boga.ts.net:26432/$PROJ?sslmode=require
EOF
```

Both URLs, every time. A file with only `DATABASE_URL` means the next person to
run a dump reaches for the public port, which is the thing LAC-6059 took ops
off. See "Ops runs over the tailnet" for why the ops one is `require`.

The hostname and `verify-full` are not optional on the app URL and there is no
per-driver variant to choose; see "One URL, every driver" above before changing
either.

### Editing a secret file, and the mode trap

`umask 077` above is load-bearing, and it only covers the file that line
creates. The failure that actually happened, on 2026-10-28:

> A run rewrote four `*-db.env` files to add the ops URL. It made a `.bak` copy
> of each first, then `chmod 600`-ed the file it had rewritten. The backups kept
> the umask default and sat at `644` for about five hours. Each one held a
> working password for a live database on a port open to `0.0.0.0/0`.

The agent shell's umask on zero is `022`, so anything that creates a file
without an explicit mode is world-readable. `chmod`-ing the file you meant to
write does not cover the copy you made of it. Use `install`, which sets the mode
as it creates:

```bash
install -m 600 the-file.env the-file.env.bak-LAC-NNNN-$(date +%Y%m%d)
```

After touching anything in that directory, check the whole family rather than
the file you were thinking about:

```bash
find ~/.paperclip/secrets -maxdepth 1 -type f ! -perm 600
```

Silence is correct. `scripts/bas-projects-db-watch.sh` now runs that check
hourly over `*-db.env*` and pages if it finds one, because the doc line you are
reading was not enough on its own: three separate runs edited these files on the
same day and one got it wrong.

Every `.bak` is another copy of a live credential and another thing to rotate.
Prune them once the cutover they were taken for is confirmed; LAC-5969 still
owns the rotation procedure and there is not one yet.

`add-project` creates the role with no `SUPERUSER`, `CREATEDB` or `CREATEROLE`,
creates the database owned by that role, revokes `CONNECT` from `PUBLIC` and
grants it back to the owner alone, appends the `hostssl` line, and reloads the
config. It is idempotent and will not reset the password of a role that already
exists.

The revoke is not decoration. Postgres grants `CONNECT` to `PUBLIC` on every new
database, so without it one project's credential opens every other project's
database on this box and reads its table names. Rows and columns stay private,
the schema does not.

Role and database names use underscores even when the project name has a hyphen,
so nothing ever needs SQL quoting: project `shipkit-www` is role and database
`shipkit_www`, and its secret file keeps the hyphenated name.

## Every project gets a preview pair

A preview deploy running a migration must not be able to reach production data,
so each project gets a second role and database with its own credential:

```bash
PW=$(openssl rand -hex 24)
printf '%s\n' "$PW" | ssh root@bas.hyrax-boga.ts.net "/usr/local/sbin/bas-projects-db.sh add-preview $PROJ"

umask 077
cat > ~/.paperclip/secrets/${PROJ//_/-}-preview-db.env <<EOF
DATABASE_URL=postgresql://${PROJ}_preview:$PW@projects-db.cloud0.dev:26432/${PROJ}_preview?sslmode=verify-full
OPS_DATABASE_URL=postgresql://${PROJ}_preview:$PW@bas.hyrax-boga.ts.net:26432/${PROJ}_preview?sslmode=require
EOF
```

Both URLs here too, for the same reason as the production pair. A preview
database is the one people reach for when they want to test a migration by
hand, which is exactly the ops traffic that belongs on the tailnet.

Pass the project name, not the preview name: `add-preview gracefully_imagined`
creates role and database `gracefully_imagined_preview`.

## Connection limits

| Role              | Limit | Why                                                     |
| ----------------- | ----- | ------------------------------------------------------- |
| production        | 25    | about four warm Vercel instances with a capped app pool |
| preview           | 5     | a preview can wedge itself without reaching production  |
| `max_connections` | 100   | 97 usable, 3 reserved for the superuser                 |

Decided on LAC-5969 on 2026-10-28, after one warm Vercel instance held all 10
connections of `gracefully_imagined`, idle, and nothing else could connect at
all, `psql` from a laptop included.

Eleven roles at these numbers overcommit `max_connections`. That is deliberate: a
role limit is a blast-radius cap, not a reservation. Splitting 97 slots evenly
across eleven roles is 7 each, which wedges every app on the box instead of one.
What overcommit costs is early warning, so LAC-5980's watcher alerts when total
`pg_stat_activity` passes 60 and when any role passes 80% of its own limit.

**Every app that connects here caps its own pool.** node-postgres defaults to a
pool of 10 and a frozen serverless instance never returns a connection, so an
uncapped app takes its whole limit and holds it. Payload needs `max: 3`,
`idleTimeoutMillis: 10_000`, `allowExitOnIdle: true`; `gracefully-imagined#26` is
the worked example.

`add-project` raises a limit toward the policy number and never lowers one. An
operator lifts a limit by hand when an app is wedged in production, and a re-run
of the script must not quietly put it back. Lower one deliberately, after that
app's pool cap is deployed:

```bash
ssh root@bas.hyrax-boga.ts.net docker exec -i projects-db \
  psql -U postgres -c 'ALTER ROLE gracefully_imagined CONNECTION LIMIT 25'
```

Two roles sit above policy today for exactly that reason: `gracefully_imagined`
at 30 and `gracefully_imagined_preview` at 10, both holdovers from the cutover on
2026-10-28. They come down to 25 and 5 once `gracefully-imagined#26` is deployed,
not before.

## Dump and restore with pg_dump 17

Pin the dump tool to the server's major version. The libpq keg on zero is 18.6,
which is the wrong direction for a PG17 target, and a newer `pg_dump` is not
guaranteed to restore into an older server. Use the image this container runs:

```bash
docker run --rm postgres:17-alpine pg_dump "$DATABASE_URL" > dump.sql
```

That is `pg_dump 17.11`, the same version Neon serves, and it carried a 50-table
schema with 17 enums with no errors. `plpgsql` is the only extension these
databases use.

## Editing the script

The copy at `/usr/local/sbin/bas-projects-db.sh` on the box does not update
itself. Editing `scripts/bas-projects-db.sh` in this repo changes nothing until
you push it:

```bash
scp scripts/bas-projects-db.sh root@bas.hyrax-boga.ts.net:/usr/local/sbin/bas-projects-db.sh
ssh root@bas.hyrax-boga.ts.net chmod 755 /usr/local/sbin/bas-projects-db.sh
```

## Rebuild from scratch

`scripts/bas-projects-db.sh bootstrap` is idempotent and covers swap, the data
and config directories, certbot and the Let's Encrypt certificate, the renewal
deploy hook, `pg_hba.conf`, and the container. It reads the superuser password on
stdin so it never lands in argv or shell history:

```bash
grep '^POSTGRES_PASSWORD=' ~/.paperclip/secrets/projects-db-superuser.env | cut -d= -f2 \
  | ssh root@bas.hyrax-boga.ts.net /usr/local/sbin/bas-projects-db.sh bootstrap
ssh root@bas.hyrax-boga.ts.net /usr/local/sbin/bas-projects-db.sh verify
```

`bootstrap` does not install the connection limits. They are a separate script
and a separate unit, so a rebuild needs one more step:

```bash
scp scripts/bas-projects-db-ratelimit.sh root@bas.hyrax-boga.ts.net:/usr/local/sbin/
ssh root@bas.hyrax-boga.ts.net 'chmod 755 /usr/local/sbin/bas-projects-db-ratelimit.sh \
  && systemctl enable --now projects-db-ratelimit.service \
  && /usr/local/sbin/bas-projects-db-ratelimit.sh show'
```

On a box that already has the certificate, `bootstrap` reuses it. On a genuinely
fresh box it requests a new one, and that is the step with a limit attached:
Let's Encrypt rate limits are per name per week and a failed attempt spends one,
so `ensure_le_cert` runs a staging dry run first and only then asks for the real
certificate. `tcp/80` has to be reachable at the name before either will work.

The box had no swap before this. `bootstrap` adds a 2 GB `/swapfile`, persists it
in `/etc/fstab`, and sets `vm.swappiness=10` in
`/etc/sysctl.d/99-swappiness.conf`. The prod box took repeated OOM kills before
it got one, and this box carries the BAS client control plane.

Never run `docker system prune` here. It would take out chatwoot and the
Paperclip Postgres cluster alongside this container.

The server itself carries Hetzner delete and rebuild protection (set 2026-10-28
on LAC-5979). There are no off-box backups yet, so the automation token that can
open a firewall rule must not also be able to destroy the only copy of this data.
Rebuilding the server, as opposed to the container, means turning protection off
first and back on after:

```bash
curl -X POST -H "Authorization: Bearer $(cat ~/.paperclip/secrets/hetzner-cloud-token)" \
  -H 'Content-Type: application/json' -d '{"delete":false,"rebuild":false}' \
  https://api.hetzner.cloud/v1/servers/169986608/actions/change_protection
```

## Not done yet

Backups, the backup-age check, and the rotate-a-password and
restore-from-backup procedures all belong to LAC-5969. **There are no off-box
backups of this container today**, which is the largest remaining gap on this
box by a distance. `scripts/bas-projects-db-watch.sh` is where the reachability
and backup-age checks go when LAC-5980 adds them: it already runs hourly from
zero, holds the Slack plumbing, and has the tailnet ssh path a backup pull
needs.

`tcp/26432` stays open to `0.0.0.0/0` for Vercel, which LAC-6056 settled and
LAC-6059 did not revisit. What changed is that the port is no longer free to
abuse and no longer carries ops. What is still true is that a leaked project
password is a full compromise of that one database from anywhere on the
internet; client-certificate auth is LAC-6060 and is the thing that would
change it.

The `projects-db-ratelimit.service` rules are reapplied when the Docker daemon
restarts (`PartOf=docker.service`) and at boot. They are not reapplied if
someone flushes `DOCKER-USER` by hand; `systemctl restart
projects-db-ratelimit` is the fix, and the jump rule's counter sitting at zero
under live traffic is how you would notice.
