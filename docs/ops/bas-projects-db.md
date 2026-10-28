# projects-db on the bas box

Self-hosted Postgres for project databases, so projects stop burning Neon compute
hours. Built by LAC-5979 under LAC-5969, certificate verification added by
LAC-6054. No project data has moved yet.

|           |                                                                                 |
| --------- | ------------------------------------------------------------------------------- |
| Host      | `projects-db.cloud0.dev:26432` → `128.140.50.130` (bas box, Hetzner cx33, Falkenstein) |
| Container | `projects-db`, `postgres:17-alpine`, `--restart unless-stopped`, 1 GB cap       |
| Data      | `/data/projects-db/data` (bind mount, plain directory on `/`)                   |
| Config    | `/data/projects-db/conf` → `/pgconf:ro` (cert, key, `pg_hba.conf`)              |
| Auth      | `scram-sha-256` over TLS, required from off-box, server cert verified            |
| Cert      | Let's Encrypt on `projects-db.cloud0.dev`, renewed by `certbot.timer`           |
| Script    | `scripts/bas-projects-db.sh`, installed at `/usr/local/sbin/bas-projects-db.sh` |
| Watch     | `scripts/bas-projects-db-cert-watch.sh` on zero, daily, silent when healthy     |
| Secrets   | zero, `~/.paperclip/secrets/<project>-db.env`, mode 600                         |

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
ssh root@128.140.50.130 docker exec -it projects-db psql -U postgres
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
LAC-6060; narrowing the open port is LAC-6056 and LAC-6059.

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
| Watch      | `scripts/bas-projects-db-cert-watch.sh`, daily                         |

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
scripts/bas-projects-db-cert-watch.sh            # from zero, read-only, no credentials
ssh root@128.140.50.130 /usr/local/sbin/bas-projects-db.sh cert-check   # on the box
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

Install the schedule (after this branch is on `main`, because a launchd job must
not point at a script that only exists on a branch):

```bash
cp docs/ops/bas-projects-db-cert-watch.plist ~/Library/LaunchAgents/com.buildandserve.projects-db-cert-watch.plist
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.buildandserve.projects-db-cert-watch.plist
launchctl print gui/$UID/com.buildandserve.projects-db-cert-watch | grep -E 'runs|last exit'
```

Verify by the `launchctl print` run count and exit code, never by the log tail:
the log is empty when everything is fine.

## Add a database

```bash
PROJ=my_project   # lowercase, [a-z][a-z0-9_], underscores not hyphens
PW=$(openssl rand -hex 24)
printf '%s\n' "$PW" | ssh root@128.140.50.130 "/usr/local/sbin/bas-projects-db.sh add-project $PROJ"

umask 077
cat > ~/.paperclip/secrets/${PROJ//_/-}-db.env <<EOF
DATABASE_URL=postgresql://$PROJ:$PW@projects-db.cloud0.dev:26432/$PROJ?sslmode=verify-full
EOF
```

The hostname and `verify-full` are not optional and there is no per-driver
variant to choose; see "One URL, every driver" above before changing either.

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
printf '%s\n' "$PW" | ssh root@128.140.50.130 "/usr/local/sbin/bas-projects-db.sh add-preview $PROJ"

umask 077
cat > ~/.paperclip/secrets/${PROJ//_/-}-preview-db.env <<EOF
DATABASE_URL=postgresql://${PROJ}_preview:$PW@projects-db.cloud0.dev:26432/${PROJ}_preview?sslmode=verify-full
EOF
```

Pass the project name, not the preview name: `add-preview gracefully_imagined`
creates role and database `gracefully_imagined_preview`.

## Connection limits

| Role          | Limit | Why                                                      |
| ------------- | ----- | -------------------------------------------------------- |
| production    | 25    | about four warm Vercel instances with a capped app pool   |
| preview       | 5     | a preview can wedge itself without reaching production    |
| `max_connections` | 100 | 97 usable, 3 reserved for the superuser                 |

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
ssh root@128.140.50.130 docker exec -i projects-db \
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
scp scripts/bas-projects-db.sh root@128.140.50.130:/usr/local/sbin/bas-projects-db.sh
ssh root@128.140.50.130 chmod 755 /usr/local/sbin/bas-projects-db.sh
```

## Rebuild from scratch

`scripts/bas-projects-db.sh bootstrap` is idempotent and covers swap, the data
and config directories, certbot and the Let's Encrypt certificate, the renewal
deploy hook, `pg_hba.conf`, and the container. It reads the superuser password on
stdin so it never lands in argv or shell history:

```bash
grep '^POSTGRES_PASSWORD=' ~/.paperclip/secrets/projects-db-superuser.env | cut -d= -f2 \
  | ssh root@128.140.50.130 /usr/local/sbin/bas-projects-db.sh bootstrap
ssh root@128.140.50.130 /usr/local/sbin/bas-projects-db.sh verify
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

Backups, the fleet-health reachability and backup-age check, and the
rotate-a-password and restore-from-backup procedures all belong to LAC-5969.
There are no off-box backups of this container today. The cert watch built here
is the place for the reachability check to sit when LAC-5980 adds it: it already
runs from zero over the public name and port on a daily schedule.

`tcp/26432` is still open to `0.0.0.0/0` and `verify-full` does not change that.
Verifying the server is server authentication, not access control. Narrowing the
exposure is LAC-6056 and LAC-6059, and client-certificate auth is LAC-6060.
