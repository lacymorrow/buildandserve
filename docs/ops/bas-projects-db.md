# projects-db on the bas box

Self-hosted Postgres for project databases, so projects stop burning Neon compute
hours. Built by LAC-5979 under LAC-5969, certificate verification added by
LAC-6054, taken off the public port for everything but Vercel by LAC-6059,
client-certificate auth added by LAC-6060, a transaction pooler put in front of
it by LAC-6076.

|           |                                                                                        |
| --------- | -------------------------------------------------------------------------------------- |
| Host      | `projects-db.cloud0.dev:26432` → `128.140.50.130` (bas box, Hetzner cx33, Falkenstein) |
| Pooled    | `projects-db.cloud0.dev:26433`, PgBouncer, transaction mode (LAC-6076)                 |
| Container | `projects-db`, `postgres:17-alpine`, `--restart unless-stopped`, 1 GB cap              |
| Data      | `/data/projects-db/data` (bind mount, plain directory on `/`)                          |
| Config    | `/data/projects-db/conf` → `/pgconf:ro` (cert, key, `pg_hba.conf`)                     |
| Auth      | `scram-sha-256` over TLS, required from off-box, server cert verified                  |
| Cert      | Let's Encrypt on `projects-db.cloud0.dev`, renewed by `certbot.timer`                  |
| Client CA | private, `/data/projects-db/ca`, 10-year root, `CN` = role name (LAC-6060)             |
| Script    | `scripts/bas-projects-db.sh`, installed at `/usr/local/sbin/bas-projects-db.sh`        |
| Pooler    | `scripts/bas-pgbouncer.sh`, installed at `/usr/local/sbin/bas-pgbouncer.sh`            |
| Watch     | `scripts/bas-projects-db-watch.sh` on zero, hourly, silent when healthy                |
| Checks    | served cert, client-cert expiry, auth failures from off-tailnet, secret file modes     |
| Secrets   | zero, `~/.paperclip/secrets/<project>-db.env`, mode 600                                |
| Ops       | over the tailnet: `bas.hyrax-boga.ts.net` = `100.117.119.81` (LAC-6059)                |
| Limits    | `authentication_timeout` 10s, 20 concurrent and 10/s new per source address            |
| ssh       | tailnet only, plus one allowlisted host (see "ssh is tailnet-only")                    |

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
hostssl keepsake             keepsake             100.64.0.0/10  scram-sha-256
hostssl keepsake             keepsake             all            scram-sha-256 clientcert=verify-full
hostssl shipkit_www          shipkit_www          all          scram-sha-256
hostssl gracefully_imagined  gracefully_imagined  all          scram-sha-256
```

The two `keepsake` lines are LAC-6060: that project requires a client
certificate from the internet and not from the tailnet. See "Client
certificates" below. Everything else is still password-only and keeps working
exactly as before, which is what makes a one-project-at-a-time rollout possible.

One `hostssl` line per project, never `hostssl all all all`. The `umami-db`
container this one is modelled on uses the wildcard form; on a multi-tenant box
that means a leaked keepsake password reaches the shipkit database.

Re-measured 2026-10-28 from zero (`107.141.224.67`) at `verify-full`, all four
confirmed:

| Attempt                                    | Result                                  |
| ------------------------------------------ | --------------------------------------- |
| `keepsake` → `keepsake`, `verify-full`     | connects                                |
| `keepsake` → `keepsake`, `sslmode=disable` | `no pg_hba.conf entry … no encryption`  |
| `keepsake` → `shipkit_www`, `verify-full`  | `no pg_hba.conf entry … SSL encryption` |
| `postgres` → `postgres`, `verify-full`     | `no pg_hba.conf entry … SSL encryption` |

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
It is not access control and it keeps nobody out. LAC-6056 ruled that the port
stays world-open for Vercel and LAC-6059 did the rest: everything that is not a
Vercel function left the port, and the port stopped being free to abuse. See
"Ops runs over the tailnet" and "Pre-auth connection limits" below.

The access control the port can actually have is a **client** certificate, added
by LAC-6060 and described below. On a project that requires one, a password on
its own stops being a way in.

## One URL, every driver

```
postgresql://<role>:<pw>@projects-db.cloud0.dev:26432/<db>?sslmode=verify-full
```

That string is what the secret files hold and what every app uses. No per-driver
spelling, no code change, nothing to remember.

A project moved onto the pooler is the one exception: it carries a second URL on
port 26433 for the app and keeps this one as `DATABASE_URL_UNPOOLED` for
migrations. See "The pooled port, and what it costs". Nothing about the spelling
changes, only the port.

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

| Client                         | Case                                 | Result                                                                              |
| ------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------- |
| `postgres` (postgres-js) 3.4.9 | hostname, `verify-full`              | connects                                                                            |
| `postgres` (postgres-js) 3.4.9 | hostname, a CA that did not sign it  | fails, `unable to get local issuer certificate`                                     |
| `postgres` (postgres-js) 3.4.9 | bare IP, `verify-full`               | fails, `Host: localhost. is not in the cert's altnames`                             |
| `postgres` (postgres-js) 3.4.9 | `&sslrootcert=system` in the URL     | fails, `unrecognized configuration parameter "sslrootcert"`                         |
| `pg` (node-postgres) 8.20.0    | hostname, `verify-full`              | connects                                                                            |
| `pg` (node-postgres) 8.20.0    | hostname, a CA that did not sign it  | fails, `unable to get local issuer certificate`                                     |
| `pg` (node-postgres) 8.20.0    | bare IP, `verify-full`               | fails, `Host: localhost. is not in the cert's altnames`                             |
| `psql` / libpq 18.6            | `verify-full` + `sslrootcert=system` | connects                                                                            |
| `psql` / libpq 18.6            | `verify-full`, no `sslrootcert`      | fails, `root certificate file … does not exist`                                     |
| `psql` / libpq 18.6            | `verify-full` + an empty root file   | fails, could not read certificate                                                   |
| `psql` / libpq 18.6            | bare IP, `verify-full`               | fails, `server certificate for "projects-db.cloud0.dev" … does not match host name` |

The two "a CA that did not sign it" rows are the ones that matter. They prove the
Node drivers check the chain, rather than checking the hostname and trusting
whatever root happens to be offered.

All three project roles connect with their stored URL verbatim, `ssl=true` in
`pg_stat_ssl`: `keepsake`, `shipkit_www`, `gracefully_imagined`.

## The certificate

|           |                                                                                               |
| --------- | --------------------------------------------------------------------------------------------- |
| Name      | `projects-db.cloud0.dev` (Cloudflare zone `cloud0.dev`, DNS-only, A → `128.140.50.130`)       |
| Issuer    | Let's Encrypt, ECDSA P-256, 90 days                                                           |
| Issued    | 2026-10-28, expires 2027-01-26                                                                |
| Lineage   | `/etc/letsencrypt/live/projects-db.cloud0.dev`                                                |
| Served as | `/data/projects-db/conf/server.crt` (fullchain, `644`) and `server.key` (`600`), both `70:70` |
| Challenge | HTTP-01 standalone, `tcp/80` on Hetzner firewall `11789519`                                   |
| Renewal   | `certbot.timer` (apt, twice daily) → deploy hook → `pg_reload_conf()`                         |
| Watch     | `scripts/bas-projects-db-watch.sh`, at most once every 20h                                    |

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

**The hook reloads two things, not one.** PgBouncer reads
`client_tls_cert_file` and `client_tls_key_file` once, at config load, and holds
the parsed pair in memory for the life of the process. Nothing in it notices the
file changing underneath. Before LAC-6122 the hook reloaded only Postgres, which
made the next Let's Encrypt expiry a timed, total outage of every pooled project
while `:26432` read perfectly: every pooled app connects `sslmode=verify-full`.
`cert-deploy` now issues `bas-pgbouncer.sh reload` as well, and reads the
certificate back off `:26433` to prove the reload took, exactly as it already
did for Postgres. Both arms are no-ops with a log line when the pooler is absent,
because certbot runs this hook unattended on a box that may not have one.

Measured 2026-10-28 on a scratch pooler on the box, which is the only way to
know a RELOAD is enough rather than assume it:

| Step                                 | Served certificate |
| ------------------------------------ | ------------------ |
| container start, cert A on disk      | A                  |
| cert B copied over the files on disk | **still A**        |
| `RELOAD` through the admin console   | B                  |

The middle row is the outage. The third is the fix.

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

The pooled port is checked over ssh instead, by
`bas-projects-db.sh pooler-cert-check`, which the watch runs in the same block
as `client-cert-check`. Over ssh rather than over the public internet for a dull
reason: `tcp/26433` was closed at the Hetzner firewall when this was written; it is open
now (see "Opening the port"), and the ssh route stayed because it also sees the
pooler's own view of its server. It compares the certificate the pooler
serves to the one on disk and checks the name on it, and it is silent and exit 0
when the pooler is healthy **or absent**. A box with no pooler is a supported
shape, not a finding. An unreachable box or a box whose installed script predates
the subcommand both void (exit 3) rather than page, the same ruling as everywhere
else here.

The same job carries the auth-failure check (see "Authentication-failure
alerting"), which is why it runs hourly while the cert half runs at most once
every `CERT_EVERY_HOURS` (20). The stamp file at
`~/.paperclip/state/projects-db-cert-checked-at` is what keeps the two cadences
apart, and it is a stamp rather than a fixed hour of the day on purpose: this
runs on a laptop that sleeps, and a fixed hour is a cert check silently skipped
on every day the lid was shut at the wrong moment. `--cert-now` forces it.

Install the schedule. The job runs an installed copy of the script under
`~/.paperclip/scripts`, not the one in this repo: `~/repo/buildandserve` is the
shared working tree for every agent in the fleet and is routinely parked on a
feature branch, so a job pointing into the repo dies whenever the checkout is on
a branch that predates the script. Copy from `origin/main` rather than from the
working tree, for the same reason:

```bash
git -C ~/repo/buildandserve show origin/main:scripts/bas-projects-db-watch.sh \
  > ~/.paperclip/scripts/bas-projects-db-watch.sh
chmod 755 ~/.paperclip/scripts/bas-projects-db-watch.sh
cp docs/ops/bas-projects-db-watch.plist ~/Library/LaunchAgents/com.buildandserve.projects-db-watch.plist
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.buildandserve.projects-db-watch.plist
launchctl kickstart -p gui/$UID/com.buildandserve.projects-db-watch
launchctl print gui/$UID/com.buildandserve.projects-db-watch | grep -E 'runs|last exit'
```

`RunAtLoad` is false and the schedule is hourly on the hour, so without the
`kickstart` the install reports `runs = 0` and proves nothing. Verify by the
`launchctl print` run count and exit code, never by the log tail: the log is
empty when everything is fine.

The installed copy can drift from `main`. Check it the same way the box's own
copy of `scripts/bas-projects-db.sh` is checked, and re-run the install if these
two lines differ:

```bash
md5 -q ~/.paperclip/scripts/bas-projects-db-watch.sh
git -C ~/repo/buildandserve show origin/main:scripts/bas-projects-db-watch.sh | md5 -q
```

## Ops runs over the tailnet

LAC-6056 ruled that `tcp/26432` stays open to `0.0.0.0/0` because Vercel egress
has no fixed IP range. That ruling is about Vercel. Nothing else has any reason
to be on that port, so LAC-6059 took everything else off it.

Each secret file therefore carries two URLs, not one:

| Variable           | Host                     | Mode          | Who uses it                         |
| ------------------ | ------------------------ | ------------- | ----------------------------------- |
| `DATABASE_URL`     | `projects-db.cloud0.dev` | `verify-full` | the app, from Vercel                |
| `OPS_DATABASE_URL` | `bas.hyrax-boga.ts.net`  | `require`     | dumps, restores, migrations, `psql` |

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

## Client certificates

`tcp/26432` is open to `0.0.0.0/0` and LAC-6056 ruled that it stays that way:
Vercel egress has no fixed IP range, Static IPs are $100/month per project on a
shared pool, and a Vercel function can join neither a tailnet nor a TCP tunnel.
That left a password as the only thing between the internet and five project
databases. LAC-6032 is this fleet's own measured instance of what that costs: a
leaked credential still authenticating weeks later.

A client certificate is the access control that is actually available here.
Postgres checks it before SCRAM runs, so both halves are required and a leaked
password on its own is no longer a way in.

|         |                                                                            |
| ------- | -------------------------------------------------------------------------- |
| Root    | `/data/projects-db/ca/ca.crt`, EC P-256, 10 years, `pathlen:0`             |
| Key     | `/data/projects-db/ca/ca.key`, `600`, in a `700` directory                 |
| Issued  | `/data/projects-db/ca/issued/<role>.crt`, public copies only               |
| Served  | `/data/projects-db/conf/clients-ca.crt` → `/pgconf` in the container       |
| Subject | `CN=<role>`, matched against the Postgres user by `clientcert=verify-full` |
| Expiry  | 2036-10-25 for the CA and every cert issued so far                         |

Nothing about this touches the Let's Encrypt chain from LAC-6054. That one
authenticates the box to clients; this one authenticates clients to the box.
Two chains, two questions, two blast radii.

**The CA private key never enters the container.** `/data/projects-db/conf` is
bind-mounted into Postgres as `/pgconf`, so a key kept there would be reachable
from inside the server. The CA lives one directory up, outside the mount, and
only the public certificate is copied in.

**`CN` is the role name, and that is the point.** `clientcert=verify-full`
compares the certificate's common name against the Postgres user. A certificate
minted for `keepsake` cannot open `shipkit_www` even by someone holding the
`shipkit_www` password. Measured below.

### The two pg_hba lines, tailnet first

```
hostssl keepsake  keepsake  100.64.0.0/10  scram-sha-256
hostssl keepsake  keepsake  all            scram-sha-256 clientcert=verify-full
```

`pg_hba.conf` is first-match-wins and does **not** fall through on a failed
authentication, so a connection from the tailnet matches line one and never
reaches line two. Ops keeps the password-only path it has always had. That
ordering is load-bearing: without it, a botched client-cert rollout would lock
ops out of the recovery path at the same moment it locks out the apps.

LAC-6060 proposed `hostssl all all 100.64.0.0/10` for the tailnet line. This is
the per-project form instead, which is strictly tighter and costs nothing: the
wildcard would mean a leaked `keepsake` password reaches the `shipkit` database
from any device on the tailnet, Lacy's phone included, which is the exact thing
the one-line-per-project rule in this file exists to prevent.

### Turning it on for one project

One project at a time, in this order, because getting it backwards is an outage:

```bash
PROJ=keepsake
# 1. Mint the certificate. Printed once; the box keeps only the public half.
ssh root@bas.hyrax-boga.ts.net "/usr/local/sbin/bas-projects-db.sh client-cert $PROJ"
# 2. Put the two variables in the Vercel project and redeploy.
# 3. Prove the app is live on them, then and only then:
ssh root@bas.hyrax-boga.ts.net "/usr/local/sbin/bas-projects-db.sh require-client-cert $PROJ"
```

`ca-init` is idempotent and runs inside `bootstrap`; `require-client-cert` calls
it too, so there is no separate CA step to forget.

**The rollback lever**, when an app is locked out and the certificate is not what
you want to be debugging at that moment. The password is untouched, so this
restores service in the time it takes to reload:

```bash
ssh root@bas.hyrax-boga.ts.net "/usr/local/sbin/bas-projects-db.sh relax-client-cert $PROJ"
```

Both directions rewrite the project's lines, check `pg_hba_file_rules` for parse
errors after the reload, and put the old file back if any line failed to parse.
A `pg_hba.conf` that does not parse keeps the **previous** rules in force and
only writes a log line, so a zero exit from the reload is not proof, the same
trap the certificate reload has.

### The repo side: two environment variables and one diff

Neither `postgres` nor `pg` reads a client certificate out of the URL string,
which is why this reverses LAC-6054's "no app code change in any of the five
repos". The cost is one small diff each.

```
DATABASE_CLIENT_CERT_B64=<base64 of the PEM>
DATABASE_CLIENT_KEY_B64=<base64 of the PEM>
```

Base64 and decoded at read. A multi-line PEM pasted straight into a Vercel
environment variable is the standard way this breaks: the dashboard keeps the
newlines, the build does not, and the failure reads as an opaque TLS error.
`client-cert` prints both variables already encoded and on one line.

**There is no CA variable, on purpose.** The server certificate is Let's
Encrypt and the client verifies it against the system trust store. Passing our
private CA as `ssl.ca` would _replace_ that store rather than add to it, and
every connection would fail with `unable to get local issuer certificate`.
Measured, not assumed.

The shared helper is `src/server/db/client-tls.ts` in this repo, with unit tests
at `tests/unit/server/db/client-tls.test.ts`. Copy the file; the diff at the
call site is one line:

```ts
import { databaseClientTlsOptions } from "./client-tls";

const client = postgres(env.DATABASE_URL, {
  max: 3,
  // …
  ...databaseClientTlsOptions(),
});
```

**Every Postgres client in the repo, not just the Drizzle one.** A Shipkit
downstream has two: the postgres-js client above and Payload's `pg` pool in
`src/payload.config.ts`. They read the same `DATABASE_URL`, so wiring one and
not the other means the app serves and the CMS is gone, on a database that is
working fine. Payload's pool takes the `pg` form:

```ts
import { nodePostgresConnection } from "@/server/db/client-tls";

db: postgresAdapter({
  pool: nodePostgresConnection(process.env.DATABASE_URL),
}),
```

`nodePostgresConnection` exists rather than composing `withoutSslMode` and
`databaseClientCertificate` at the call site, because the safe order is not the
obvious one: stripping `sslmode` on a database with no client certificate is a
silent TLS **downgrade**, since `pg` with neither `sslmode` nor an `ssl` object
does not negotiate TLS at all. The strip and the certificate happen together or
not at all. Test the CMS route when flipping a project, not only the app.

### Three driver traps, all of them measured

**Spread the options, never write `ssl: maybeUndefined`.** postgres-js resolves
options with `k in o`, so an explicit `ssl: undefined` counts as _set_ and beats
the `sslmode=verify-full` in the URL. TLS then goes off entirely and the server
answers `no pg_hba.conf entry … no encryption`, which reads like a server
problem and is not. `databaseClientTlsOptions()` returns `{}` rather than
`{ ssl: undefined }` for exactly this reason.

**`pg` needs `sslmode` removed from the URL.** `ConnectionParameters` merges the
parsed connection string _over_ the explicit config
(`config = Object.assign({}, config, parse(config.connectionString))`), so
`sslmode=verify-full` silently discards an `ssl: { cert, key }` passed next to
it. The certificate is never sent and the server answers `connection requires a
valid client certificate`, which also points at the server rather than at the
driver. Use `withoutSslMode(url)` from the same helper. Nothing is lost: with an
`ssl` object, Node verifies the chain and the hostname by default, and both
halves were re-checked by breaking them on purpose (table below). postgres-js
does not need this; it resolves the explicit option first.

**A `CN` mismatch is reported to the client as a password failure.** The server
log has the real reason on the line above:

```
LOG:  certificate validation (clientcert=verify-full) failed for user "keepsake": CN mismatch
FATAL:  password authentication failed for user "keepsake"
```

An operator holding the wrong certificate will otherwise spend the afternoon on
the password. It also means a `CN` mismatch is counted by the authentication
failure watch as a password failure, which is the right outcome: both are worth
a page.

### `psql`

Two more command-line flags next to the `sslrootcert=system` this already
needed. They are file paths, so the stored URL does not change:

```bash
export PGSSLROOTCERT=system
psql "$DATABASE_URL&sslcert=$PWD/keepsake.crt&sslkey=$PWD/keepsake.key" -c 'select 1'
```

Decode the two variables from `~/.paperclip/secrets/<project>-db.env` to get
those files. libpq requires the key to be `600` or it refuses to use it.

### Revocation, and why there is no CRL

There is no certificate revocation list here, and that is a decision rather than
an omission.

A client certificate is one of two factors: holding it proves nothing without
the role's password. The case that would need a CRL is a leaked certificate
**and** a leaked password, which is already a full compromise of that database,
and the lever for that is rotating the password. Rotation is immediate, needs
one command, and does not add anything new that can expire.

A CRL would. `ssl_crl_file` makes OpenSSL check the list's own validity, so an
expired CRL locks every certificate client out at once, which is the exact
failure this design is built to avoid, re-introduced with a short fuse. Not
worth it for a lever that is slower than the one we already have.

#### On the pooled port the certificate *is* the credential

The paragraph above holds on `:26432` and does not hold on `:26433`, and the
difference is the whole of LAC-6122 F6.

PgBouncer's client auth is `cert`, which means no password is sent at all, so
the certificate is single-factor there (see "PgBouncer terminates TLS" below for
why there is no other option: `clientcert=` is not a PgBouncer setting and its
HBA parser rejects it). Rotating the role's password does **not** end access
through the pooler. PgBouncer also has no CRL setting of any kind, so there is
nothing to revoke into.

The only lever that ends a leaked certificate's access to the pooled port is:

```bash
ssh root@bas.hyrax-boga.ts.net "/usr/local/sbin/bas-pgbouncer.sh drop-project <role>"
```

That removes the role's pool entry, its userlist entry and its `cert` hba line,
so revocation and taking that project off the pooler are the same action. The
project keeps working as soon as its `DATABASE_URL` points back at `:26432` and
it redeploys, which is also the ordinary rollback path, so the cost is one
redeploy rather than an outage. **Rotate the password as well**, because the
direct port still accepts it.

This is an acceptable answer rather than a good one, and it is written down here
so the first person who needs it does not go looking for a CRL that does not
exist. A second lever would be reissuing the CA, which is a flag day for every
project requiring a certificate.

#### What to do if a client key leaks

The blast radius of one leaked client key is **one database**, because `CN` must
equal the role name: a `keepsake` key is useless against `shipkit_www` whatever
password comes with it. And on its own it is useless against `keepsake` too,
because the password is still required.

In order:

1. **Rotate that role's password.** This is the lever. It is immediate, it is
   one command, and it invalidates the leaked pair whether or not the
   certificate is still technically valid. Update the project's `DATABASE_URL`
   in Vercel and in `~/.paperclip/secrets/<project>-db.env`.
2. **Mint a fresh certificate** for the role and deploy it, so the leaked one
   stops being the one in use: `client-cert <role>`.
3. Only if the **CA key** leaked, not a client key, replace the CA. Delete
   `/data/projects-db/ca/ca.crt` and `ca.key`, run `ca-init`, reissue every
   certificate and update every flipped project. That is a flag day for every
   project requiring a certificate, which is the honest cost of having no CRL
   and the reason the CA key is `600` in a `700` directory outside the
   container's bind mount.

Step 1 alone closes the hole. Steps 2 and 3 are hygiene.

### Expiry

Ten years, and the date is 2036-10-25 for everything issued so far. A client
certificate expiry is a simultaneous outage for every project that requires one,
so it is watched rather than remembered, in the same check as the server cert
(LAC-5980):

```bash
ssh root@bas.hyrax-boga.ts.net /usr/local/sbin/bas-projects-db.sh cert-check         # both halves
ssh root@bas.hyrax-boga.ts.net /usr/local/sbin/bas-projects-db.sh client-cert-check  # the client half alone
scripts/bas-projects-db-watch.sh --cert-now                                          # from zero, both
```

The watch on zero runs the box's own `client-cert-check` over ssh rather than
reimplementing the thresholds, so there is one copy of them. It warns at 180
days for both the CA and any issued certificate, because reissuing means editing
Vercel projects by hand and that is scheduled work, not an incident. If the box
cannot be reached the run **voids** (exit 3) instead of paging, the same ruling
LAC-5278 made for the store watch.

It also covers the one client-certificate fault with a short fuse:
`ssl_ca_file` pointing at a file that is gone. The running server holds the CA
in memory and keeps working, so nothing looks wrong until the next restart,
which then fails to start.

### `ssl_ca_file` is set with ALTER SYSTEM, not a container flag

Every other Postgres setting here is a `-c` flag on the `docker run` command.
This one is not, and the difference is deliberate: a `-c ssl_ca_file=…` pointing
at a file that is missing is a container that **will not start at all**. ALTER
SYSTEM writes `postgresql.auto.conf`, which is only written once the file
exists, survives a restart the same way, and is a `sighup` setting, so it costs
a reload rather than a restart.

Loading a CA does not require a certificate from anybody. Postgres asks for one
once a CA is present, but whether a missing one is fatal is decided per
`pg_hba.conf` line by the `clientcert` keyword. Confirmed on the live box:
`gracefully_imagined` kept serving throughout.

A reload that cannot read the CA keeps the **old** TLS context and writes
`SSL configuration was not reloaded`, exactly like the server-certificate
reload, so `show ssl_ca_file` is not proof. `ca-init` checks three things and
**puts `ssl_ca_file` back** if any of them fail, because a rejected path left
in `postgresql.auto.conf` is the very container-will-not-start failure this
design exists to avoid:

1. the postmaster logged the change at all, so the SIGHUP was acted on
2. it did not also log `SSL configuration was not reloaded`
3. the server really advertises a client CA to a connecting client

Point 1 is not ceremony. `pg_reload_conf()` returns when the SIGHUP is **sent**,
not when the postmaster has acted on it, so reading the log straight afterwards
is a race that fails open. Measured 2026-10-28 while writing this: the grep ran,
found nothing, reported success, and Postgres wrote the refusal six
milliseconds later, leaving `ssl_ca_file` pointing at a file that did not exist.
`ca-init` now waits for `parameter "ssl_ca_file" changed to …` before it reads
anything.

Point 3 is a direct functional read rather than a log line, the same way
`cert-deploy` reads the served certificate back:

```bash
printf 'Q\n' | openssl s_client -starttls postgres -connect 127.0.0.1:26432 \
  -servername projects-db.cloud0.dev 2>/dev/null | grep -A2 'Acceptable client certificate CA names'
# CN = projects-db client CA
```

Rollback was exercised on the live box by pointing `ssl_ca_file` at a path that
does not exist: the reload was refused, `ca-init` reverted to
`/pgconf/clients-ca.crt`, and `keepsake` kept authenticating with its
certificate throughout.

### Measured 2026-10-28 from zero, against the live box

`keepsake` is the landed project. It is a real project role with no live app
yet, so it is the one place this can be proven end to end at zero risk.

| Client                           | Case                                                   | Result                                                     |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| `psql` / libpq 18.6              | `sslcert` + `sslkey`, `verify-full`                    | connects, `client_dn=/CN=keepsake`                         |
| `psql` / libpq 18.6              | no client certificate                                  | `FATAL: connection requires a valid client certificate`    |
| `psql` / libpq 18.6              | no certificate **and** a wrong password                | same certificate error, so the cert gate runs before SCRAM |
| `psql` / libpq 18.6              | correct certificate, wrong password                    | `password authentication failed`, so SCRAM still runs      |
| `psql` / libpq 18.6              | `shipkit_www` certificate, correct `keepsake` password | refused; server log says `CN mismatch`                     |
| `psql` / libpq 18.6              | tailnet URL, no client certificate                     | connects, `client_addr=100.86.145.8`                       |
| `postgres` (postgres-js) 3.4.9   | `ssl: { cert, key }`                                   | connects, `client_dn=/CN=keepsake`                         |
| `postgres` (postgres-js) 3.4.9   | no `ssl` option, URL `sslmode=verify-full`             | refused, requires a valid client certificate               |
| `postgres` (postgres-js) 3.4.9   | `ssl: { ca: privateCA, cert, key }`                    | fails, `unable to get local issuer certificate`            |
| `postgres` (postgres-js) 3.4.9   | `ssl: undefined` spread in                             | fails, `no pg_hba.conf entry … no encryption`              |
| `pg` (node-postgres) 8.20.0      | `ssl: { cert, key }`, `sslmode` left in the URL        | refused; the URL clobbered the cert                        |
| `pg` (node-postgres) 8.20.0      | `ssl: { cert, key }`, `sslmode` stripped               | connects, `client_dn=/CN=keepsake`                         |
| `pg` (node-postgres) 8.20.0      | stripped, plus a CA that did not sign the server       | fails, `unable to get local issuer certificate`            |
| `pg` (node-postgres) 8.20.0      | stripped, against the bare IP                          | fails, `Hostname/IP does not match certificate's altnames` |
| `gracefully_imagined` (live app) | password only, unchanged, throughout                   | connects                                                   |

The last row is the one that makes a staged rollout real: turning the CA on and
flipping one project changed nothing for the project that was still serving
traffic.

Both drivers were also re-run through this repo's own helper rather than a
hand-rolled config, and both reported `client_dn=/CN=keepsake`.

### Rollout state

| Role                          | Certificate | `clientcert=verify-full` | Who finishes it                   |
| ----------------------------- | ----------- | ------------------------ | --------------------------------- |
| `keepsake`                    | issued      | **on**                   | LAC-5981 carries the env vars     |
| `shipkit_www`                 | issued      | off                      | LAC-5982                          |
| `gracefully_imagined`         | issued      | off                      | LAC-5984                          |
| `gracefully_imagined_preview` | issued      | off                      | LAC-5984                          |
| `ai_profile_pic`              | not yet     | off                      | LAC-6045, role does not exist yet |

Every issued certificate is in that project's
`~/.paperclip/secrets/<project>-db.env` on zero, mode `600`, next to the URLs.
A project is flipped by whoever lands its move, after its app is live on the
certificate, with the one command above.

## Pre-auth connection limits

`max_connections` is 100 and `superuser_reserved_connections` is 3, so there are
97 usable slots shared by every project on the box. The problem LAC-6059 fixed is
that reaching those slots needs no credential at all:

> Postgres reserves the backend slot at fork and checks the role's `CONNECTION
LIMIT` only after authentication succeeds.

So the per-role `CONNECTION LIMIT` every project role carries (see "Connection
limits" below for the current values) stops a runaway app and stops nothing
else. One internet host that opens 97 TCP
sessions and never finishes a SCRAM exchange takes all five project databases
down for as long as it keeps doing it, authenticates as nobody, and leaves no log
line naming anyone. Measured before the fix: `authentication_timeout` was 60s, so
97 sockets and a loop was the entire attack.

Two levers, both applied:

| Lever                                  | Before | After                         |
| -------------------------------------- | ------ | ----------------------------- |
| `authentication_timeout`               | 60s    | 10s                           |
| concurrent sessions per source address | none   | 20, `REJECT` with a TCP reset |
| new connections per source address     | none   | 10/s, burst 20, `REJECT`      |

**Both ports, one budget.** The limits cover `26432` and `26433`. The pooled
port was outside them when it was added, because the jump rule keys on
`--ctorigdstport 26432` and nothing else matched (LAC-6122 F2); opening 26433 to
`0.0.0.0/0` in that state would have been a world-open listener with none of the
protection this was built for. PgBouncer is the worse of the two to leave
unprotected: it is single-threaded and it terminates TLS, so a handshake flood
blocks every real client on the same thread, where Postgres forks per connection
and holds `authentication_timeout=10s`. `max_client_conn=1000` against
PgBouncer's default `client_login_timeout` of 60s is a thousand half-finished
logins able to wedge the pooler a minute at a time.

Both ports jump into the same `PROJECTSDB` chain, so one source address gets one
allowance of 20 concurrent and 10/s **across both of them** rather than a
separate allowance each. That is deliberate: the thing being defended is the box.
It is also the only option available, because `xt_connlimit` counts conntrack
entries per source address rather than per port, and `hashlimit` shares one hash
table per `--hashlimit-name`.

The unit is in the repo at `docs/ops/projects-db-ratelimit.service`. Its
`ExecStart` passes no `PORT`, so the script's default covers both listeners;
that is what makes the pooled port's limits survive a Docker restart rather than
being a rule someone ran once by hand.

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

| Case                                                  | Result                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| one app connection, `verify-full`, public name        | connects                                                       |
| 40 concurrent sockets, public name                    | 20 established, 20 reset (`connlimit` counter 20)              |
| 40 concurrent sockets, tailnet address                | 40 established, 0 reset (tailnet `RETURN` counter 160 packets) |
| 80 connects at 311/s, public name, concurrency lifted | 21 established, 59 reset (`hashlimit` counter 59)              |
| `pg_dump` of `gracefully_imagined` over the tailnet   | 419 objects, 155K, server saw client `100.86.145.8`, TLSv1.3   |

### Is 20 concurrent per source enough? Measured 2026-10-28

The LAC-6061 security read passed this but flagged one unknown: 20 concurrent
per source address is untested against real Vercel egress, which may be shared
NAT. Measured two hours after the rules went in, on a normal weekday hour:

|                                          |     |
| ---------------------------------------- | --- |
| `connection received` in one hour        | 195 |
| of those, authorized                     | 150 |
| `FATAL` (auth failures)                  | 11  |
| busiest real client, concurrent backends | 1   |
| `connlimit` rejects since install        | 0   |
| `hashlimit` rejects since install        | 0   |

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

| Line                             | What it means                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `password authentication failed` | someone has a role name and is trying passwords, or an app is deployed with a stale one                  |
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

| Proto | Port    | Source               | Why                                                                    |
| ----- | ------- | -------------------- | ---------------------------------------------------------------------- |
| tcp   | `22`    | `178.156.130.157/32` | the off-tailnet dead-man check, forced-command key only                |
| udp   | `41641` | `0.0.0.0/0`, `::/0`  | tailscale direct wireguard; without it everything falls back to DERP   |
| icmp  | —       | `0.0.0.0/0`, `::/0`  | so reachability can be distinguished from a dead service               |
| tcp   | `26432` | `0.0.0.0/0`          | projects-db for Vercel (LAC-6056). No `::/0`: see the third trap above |
| tcp   | `80`    | `0.0.0.0/0`, `::/0`  | certbot HTTP-01; nothing listens here between renewals                 |

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
scp docs/ops/projects-db-ratelimit.service \
  root@bas.hyrax-boga.ts.net:/etc/systemd/system/projects-db-ratelimit.service
ssh root@bas.hyrax-boga.ts.net 'chmod 755 /usr/local/sbin/bas-projects-db-ratelimit.sh \
  && systemctl daemon-reload \
  && systemctl enable --now projects-db-ratelimit.service \
  && /usr/local/sbin/bas-projects-db-ratelimit.sh show'
```

The pooler is a third script and a third step, after the database is up:

```bash
scp scripts/bas-pgbouncer.sh root@bas.hyrax-boga.ts.net:/usr/local/sbin/
ssh root@bas.hyrax-boga.ts.net 'chmod 755 /usr/local/sbin/bas-pgbouncer.sh \
  && /usr/local/sbin/bas-pgbouncer.sh bootstrap && /usr/local/sbin/bas-pgbouncer.sh verify'
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

## The pooled port, and what it costs

LAC-6076. `projects-db.cloud0.dev:26433` is PgBouncer in transaction pooling
mode. It exists so the number of *server* connections stops depending on how
many instances Vercel happens to warm.

|            |                                                                                 |
| ---------- | ------------------------------------------------------------------------------- |
| Pooled     | `projects-db.cloud0.dev:26433` → `DATABASE_URL`, the app                        |
| Direct     | `projects-db.cloud0.dev:26432` → `DATABASE_URL_UNPOOLED`, migrations and ops    |
| Container  | `projects-db-pooler`, `edoburu/pgbouncer` pinned by digest, PgBouncer 1.26.1    |
| Network    | `projects-db-pool`, private bridge, Postgres pinned at `172.31.0.2`             |
| Auth       | client certificate only: chain against the private CA, `CN` bound to the role   |
| Script     | `scripts/bas-pgbouncer.sh`, installed at `/usr/local/sbin/bas-pgbouncer.sh`     |
| Secrets    | `/data/pgbouncer/secret/userlist.txt`, **plaintext role passwords**, `600 70:70` |
| Firewall   | `tcp/26433` is **not** open at the Hetzner firewall yet (see "Opening the port") |

Measured on 2026-10-28 against `gracefully_imagined_preview`, 12 concurrent
clients each running a short-transaction loop, identical traffic both ways:

| Same 12 clients        | Direct `:26432`               | Pooled `:26433`      |
| ---------------------- | ----------------------------- | -------------------- |
| clients served         | 4 of 12                       | **12 of 12**         |
| the other 8            | `too many connections for role` | queued, then served |
| `pg_stat_activity`     | 5, all **idle**               | **3, all active**    |

That is the whole ticket in one table. The direct port does not run out of
capacity, it runs out of *slots held idle by instances that are not using them*.

### PgBouncer terminates TLS, and that nearly removed LAC-6060 silently

This is the part to read before changing any TLS or auth setting.

Postgres never sees the app's client certificate through the pooler, so
`clientcert=verify-full` does not reach through it. **Two** PgBouncer settings
replace it and both are required:

```ini
client_tls_sslmode = verify-full   # proves the cert chains to the private CA
auth_type = hba                    # + method `cert` per line: binds CN to the role
```

The ticket proposed `client_tls_sslmode=verify-full` plus `client_tls_ca_file`
and called that sufficient. **It is not, and the gap is invisible.** PgBouncer's
`verify-full` is documented as "Same as verify-ca": it checks the chain and never
looks at the common name. On its own it accepts *any* certificate this CA ever
issued for *any* role, so a `shipkit_www` certificate would open `keepsake`.
Only the `cert` method in `auth_hba_file` takes the user name from the CN.

The reverse is also true: a `cert` line without `client_tls_sslmode` at
`verify-ca` or above accepts any self-signed certificate claiming any CN,
because at `require` and below "if the client presents a client certificate, it
is not validated".

There is no PgBouncer configuration that reproduces Postgres's
`scram-sha-256 clientcert=verify-full`, which demands a certificate **and** a
password. `clientcert=` is not a PgBouncer setting, and its HBA parser rejects
any option it does not handle outright (`unsupported parameters`, `src/hba.c`).
So the pooled path is cert-only, single-factor, by necessity rather than choice.

Measured 2026-10-28 from zero over the tailnet, all four:

| Attempt at `:26433`                                   | Result                                       |
| ----------------------------------------------------- | -------------------------------------------- |
| `gracefully_imagined_preview` cert, matching role      | connects, `inet_server_port` = 5432          |
| no client certificate at all                           | `SSL error: tlsv13 alert certificate required` |
| `keepsake` cert presented for the preview role         | `FATAL: certificate authentication failed`   |
| preview cert asking for the `keepsake` database        | `FATAL: no authentication method is found`   |

The second one is refused during the TLS handshake, before a password is ever
read. The third is the LAC-6060 guarantee surviving the hop.

**What is genuinely weaker than the direct port.** A leaked certificate *and*
private key, with no password, now opens that database; on `:26432` it would
still be refused. The threat LAC-6060 was built for still fails closed, because
that one (LAC-6032) is a leaked *password*, and a password alone opens nothing
on either port. In practice both halves live in the same Vercel environment and
leak together, which is why this was judged an acceptable trade rather than a
free one.

### The pooler holds plaintext passwords, which is new

`/data/pgbouncer/secret/userlist.txt`, mode `600`, owner `70:70`, in a `700`
directory, outside every mount Postgres can see.

It cannot be avoided. PgBouncer still has to open the server connection itself,
and it can only reuse a stored SCRAM secret for that if the *client* also
authenticated with SCRAM. With client auth set to `cert`, it cannot, so a
plaintext password is the only thing that works.

The marginal exposure is smaller than it first reads: root on this box already
reaches every database with no password at all through the `local all all trust`
line, by way of `docker exec`. What this file adds is a credential that works
*from somewhere else*. Treat it as equivalent to the whole box.

The pooler holds **one** certificate globally, so it could never satisfy
`clientcert=verify-full` for more than a single role no matter how it were
configured. That is why `pg_hba.conf` gets a pooler line ahead of the
internet-facing one:

```
hostssl p p 172.31.0.0/24   scram-sha-256                        <- the pooler
hostssl p p 100.64.0.0/10   scram-sha-256                        <- ops
hostssl p p all             scram-sha-256 clientcert=verify-full <- the internet
```

`172.31.0.0/24` is a private Docker bridge with no route in from anywhere, so
that line is reachable only by a container this box's root attached to it.

**The two controls are not identical, and the difference is invisible in both
configs.** PgBouncer's `cert` method calls `tls_peer_cert_contains_name()`,
which matches the CN **or any subjectAltName**. Postgres `clientcert=verify-full`
matches the CN and nothing else. The pooled path is only as narrow as the CN
today because `client-cert` issues with `-subj "/CN=$role"` and an extfile that
carries no SAN. Add a SAN to that issuance template one day and the role binding
widens on the pooled port and not on the direct one, with nothing to see in
either file (LAC-6122).

### What breaks in transaction mode

A server connection goes back to the pool when the **transaction** ends, so
anything that outlives a transaction is gone. Put it on `:26432`:

- **drizzle migrations.** `drizzle-kit` takes an advisory lock to serialise
  concurrent migrators. An advisory lock is session state, so under transaction
  pooling it can be taken on one server connection and released from another, or
  never actually held while every individual run still reports success.
- **`LISTEN` / `NOTIFY`.** The listener is attached to a server connection that
  is handed to someone else between statements.
- **advisory locks** generally, for the same reason.
- **`SET` meant to outlive a statement**, including `SET ROLE`.
- **SQL-level `PREPARE` / `EXECUTE` / `DEALLOCATE`.** PgBouncer tracks
  *protocol-level* prepared statements and explicitly does not track these.

`search_path` is deliberately **not** in `ignore_startup_parameters`. A silently
dropped `search_path` under transaction pooling means queries landing in the
wrong schema on a connection that looks healthy; failing loudly with
"unsupported startup parameter" is the better outcome. Add to that list one
parameter at a time, after deciding what it does when a connection is reused.
This repo is safe either way: `DB_PREFIX` is a table-name prefix, not a schema.

### `prepare: false`, and why the usual reason for it is out of date

The repo side is `src/server/db/pooling.ts`, with tests at
`tests/unit/server/db/pooling.test.ts`. It detects a pooled URL and spreads
`prepare: false` into the postgres-js options; `drizzle.config.ts` takes
`migrationDatabaseUrl()` so migrations go to the direct port on their own.

The reason normally given is that transaction pooling and named prepared
statements cannot coexist. **That has not been true since PgBouncer 1.21.**
`max_prepared_statements` defaults to 200, and the pooler transparently
re-prepares a statement on whichever server connection the next transaction
lands on. Measured against this pooler: 24 concurrent queries succeed with and
without the option, and so does a statement whose result type changes under it.

It stays on anyway, because it removes any dependence on PgBouncer inspecting
and rewriting our queries, which is where its own documented failure modes live:
`cached plan must not change result type`, and needing a console `RECONNECT`
after a schema migration. A serverless connection is too short-lived to amortise
a cached plan, so this gives up almost nothing. It is reversible.

**Node's `pg` needs no equivalent.** It sends unnamed statements unless a query
is given a `name`, so there is nothing to turn off. Payload's pool is dangerous
here for the other reason entirely: it defaults to `max: 10` and must be capped.

### Two traps worth more than the rest of this section

**`sslrootcert=system` in a `DATABASE_URL` makes `drizzle-kit` silently apply
nothing.** Measured twice from the same starting state: with it in the URL the
migration does not run, no table is created, and **no error is printed**;
without it the same migration applies. `pg` does not understand the libpq
spelling and drizzle-kit swallows the connection failure. The secret files tell
you to pass `sslrootcert=system` to `psql`, where it is required and correct.
Never copy it into a URL a Node driver will read.

**`pg` and postgres-js ignore `PGHOSTADDR`.** A measurement aimed at the tailnet
with that variable set goes to the public IP instead and times out on a
firewalled port, which reads exactly like a broken pooler. Pin the name with
`ssl: { servername: "projects-db.cloud0.dev" }` and put the tailnet host in the
URL, or use `psql`, which does honour it.

### Opening the port

`tcp/26433` is **open to `0.0.0.0/0` and `::/0`** on the Hetzner firewall
(`bas-automation`, id 11789519), as of 2026-10-29. Vercel egress has no fixed IP
range, so this is the only shape that works, and it is the same decision LAC-6056
made for `:26432`. What makes it tolerable is the rate limit: the second
`--ctorigdstport 26433` jump into `PROJECTSDB` lives in
`projects-db-ratelimit.service` (`docs/ops/projects-db-ratelimit.service`), which
runs `install` with no `PORT` and so covers both ports, and which `PartOf=docker.service`
reapplies after a daemon restart. Re-installing `bas-projects-db-ratelimit.sh`
from an old checkout removes it, so install all three scripts from the same commit.

### Rolling one project over

Preview first, never production first, one at a time.

```bash
PROJ=gracefully_imagined_preview
# 1. The pooler needs the role's password to open server connections.
#    Read from stdin; never an argument.
grep '^DATABASE_URL=' ~/.paperclip/secrets/${PROJ//_/-}-db.env \
  | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|' \
  | ssh root@bas.hyrax-boga.ts.net "/usr/local/sbin/bas-pgbouncer.sh add-project $PROJ"

# 2. If the project is already at clientcert=verify-full, re-run this once. It
#    rewrites the hba trio and adds the pooler line, which a project flipped
#    before LAC-6076 does not have.
ssh root@bas.hyrax-boga.ts.net "/usr/local/sbin/bas-projects-db.sh require-client-cert $PROJ"

# 3. Mint the client certificate. The key is printed ONCE and never stored; a
#    lost key means minting a fresh pair, not recovering it.
ssh root@bas.hyrax-boga.ts.net "/usr/local/sbin/bas-projects-db.sh client-cert $PROJ"
#    Put the two base64 values in Vercel as the cert and key variables.
#
# 3b. In Vercel: DATABASE_URL to port 26433, DATABASE_URL_UNPOOLED to 26432.
#    BOTH, in the same edit. Setting only the first one makes the next build
#    fail loudly on purpose (LAC-6122 F4): migrationDatabaseUrl() throws rather
#    than fall back to a pooled URL, because a migration through a transaction
#    pooler takes drizzle-kit's advisory lock on one server connection and can
#    release it from another, while every run still reports success.
#    Keep the client cert variables exactly as they are.
# 4. Redeploy and check the app AND the CMS route, then:
ssh root@bas.hyrax-boga.ts.net "/usr/local/sbin/bas-pgbouncer.sh pools"
```

Verify with the real certificate, then with none. Both matter:

```bash
PGSSLCERT=c.crt PGSSLKEY=c.key psql \
  "postgresql://$PROJ@projects-db.cloud0.dev:26433/$PROJ?sslmode=verify-full&sslrootcert=system" \
  -At -c "select current_user"        # prints the role

psql "postgresql://$PROJ@projects-db.cloud0.dev:26433/$PROJ?sslmode=verify-full&sslrootcert=system" \
  -At -c "select 1"                   # MUST fail: tlsv13 alert certificate required
```

A pooler that answers the second command is the `cert` regression: the chain is
being checked and the role binding is not.

**Revoking a leaked certificate.** There is no CRL. PgBouncer has no CRL setting,
and `bas-projects-db.sh` sets no `ssl_crl_file` on the Postgres side either. On
the direct port a leaked cert survives only until the password is rotated, because
the password is a second factor. On the pooled port the certificate *is* the
credential, so the one lever that ends a leaked one is
`bas-pgbouncer.sh drop-project <role>`, and revocation and an outage of that
project are the same action. Then mint a fresh pair with `client-cert` and re-add
the project. Certificates last 10 years (`CLIENT_DAYS=3650`); do not go looking
for a CRL.

### A recreate must not sever the pooler, and the monitor says so

The pooler reaches Postgres over the `projects-db-pool` bridge, where
`projects-db.cloud0.dev` is an alias for `172.31.0.2`. A recreated `projects-db`
container does not carry that attachment, and the pooler then resolves the name to
the public address, where `tcp/5432` is not published: every pooled login fails
`client_login_timeout (server down)`. That ran 3h50m on 2026-10-29 after the
pgvector recreate (LAC-6122 F8). `bas-projects-db.sh` now calls
`bas-pgbouncer.sh network` on every path out of `ensure_container`, and
`pooler-cert-check` fails if the pooler's resolution of its server is not an
address of `projects-db`. By hand: `bas-pgbouncer.sh network`.

The pooled port has a monitor role so fleet-health's `projects-db-pooled` arm can
authenticate (LAC-6122 F9): feed the `fleet_monitor` password on stdin to
`bas-pgbouncer.sh add-project fleet_monitor` (pool of `MONITOR_POOL=1`, no
reserve, database `MONITOR_DB`, default `postgres`), mint its certificate with
`bas-projects-db.sh client-cert fleet_monitor`, then add
`PROJECTS_DB_MONITOR_POOLED_URL` to
`~/.paperclip/secrets/projects-db-monitor.env` on **both** fleet-health hosts.

`add-project` refuses a pool larger than the role's `CONNECTION LIMIT`, which is
the trap that otherwise bites later: a pool of 10 against a preview role limited
to 5 does not fail at configuration time, it fails as the pooler trying to open a
connection the role is not allowed to have. Production gets `pool_size=10
reserve_pool=5` against a limit of 25; preview gets `3` and `2` against 5.

### The sum of the pools is the real ceiling, and it is 85

A role's `CONNECTION LIMIT` bounds one tenant. What bounds the **server** is the
sum of (`pool_size` + `reserve_pool`) over every pooled database, and until
LAC-6122 nothing checked it. `max_connections` is 100 less 3 held for the
superuser, so 97 usable, shared with every direct-port migration and ops session.
Five production pairs at 10+5 plus five preview pairs at 3+2 is exactly **100**.
The eleven-role plan reaches about 115.

Overcommitting a role's `CONNECTION LIMIT` is deliberate and correct, because a
limit is a blast-radius cap. A pool size is much closer to a reservation: the
pooler opens up to `pool_size` under load and holds it for
`server_idle_timeout=60`. Cross the global ceiling and Postgres raises
`FATAL: sorry, too many clients already` against whichever project happens to
ask next, at a time unrelated to the configuration change that caused it. That
is the cross-tenant blast radius LAC-5969 removed, one layer up.

So `add-project` sums the recorded pool entries, counting the one it is about to
write, and refuses above `POOL_BUDGET`, which is 85 of 97. The remaining 12 are
for a migration and an ops session. It prints the running total on success, and
`verify` prints it any time:

```
server-connection budget: 5 of 85 used
```

The belt underneath is `max_db_connections = 15` in the generated config, so no
single database can open more server connections than one production pair is
allowed whatever a hand-edited `databases.d` line asks for. PgBouncer has no
*global* server-connection limit, which is why the sum has to be enforced at
configuration time rather than by the pooler.

If the budget is genuinely in the way, the order to try is: drop an unused
project, lower `PROD_POOL`, or raise `max_connections` on the server. The last
one costs memory in a container capped at 1 GB, which is why it is last.

### The pooler container is hardened; the Postgres one next to it is not

`--cap-drop=ALL`, `--security-opt no-new-privileges`, `--read-only`, uid 70, and
nothing writable but `/data/pgbouncer/run`. This is an internet-facing TLS
terminator with the Let's Encrypt private key on its mount, so it gets less than
the database container beside it. Measured: PgBouncer 1.26.1 starts, listens and
reloads with all three. It logs to stderr and the generated config sets no
pidfile and no logfile, so the socket directory is the only path it needs.

`bootstrap` recreates the container when the hardening is missing as well as
when the image digest changes, because these are host config rather than image
content and a container built before LAC-6122 would otherwise match on image and
be left alone. `verify` prints what is actually in force:

```
CapDrop=[ALL] SecurityOpt=[no-new-privileges] ReadOnlyRootfs=true User=postgres
```

The Postgres container is equally unhardened and that is a separate change with
a worse blast radius if it goes wrong, so it is not in this one.

**The rollback lever.** Point `DATABASE_URL` back at `:26432` and redeploy; the
direct port was never changed. To take the project off the pooler entirely:

```bash
ssh root@bas.hyrax-boga.ts.net "/usr/local/sbin/bas-pgbouncer.sh drop-project $PROJ"
```

### Looking at it

```bash
ssh root@bas.hyrax-boga.ts.net "/usr/local/sbin/bas-pgbouncer.sh verify"
ssh root@bas.hyrax-boga.ts.net "/usr/local/sbin/bas-pgbouncer.sh pools"
ssh root@bas.hyrax-boga.ts.net "/usr/local/sbin/bas-pgbouncer.sh console 'SHOW SERVERS'"
```

In `SHOW POOLS`, `cl_active` and `cl_waiting` are app connections and are
expected to exceed `sv_active`; that gap is the point. A persistently high
`maxwait` means `pool_size` is below real concurrency, which is a tuning
problem, not a pooling one. The admin console is a unix socket in a `700`
directory reached through a throwaway `psql` container, so it is root-on-the-box
only and there is no pooler admin credential stored anywhere.

### Still to do on the pooler

The certificate half and the network half are done (LAC-6122): the deploy hook
reloads the pooler and proves it took, `pooler-cert-check` runs over ssh every
`CERT_EVERY_HOURS` and also catches a pooler cut off from its server. The
remaining step is the `PROJECTS_DB_MONITOR_POOLED_URL` secret on both
fleet-health hosts, which is an operator action and not in this repo.

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
