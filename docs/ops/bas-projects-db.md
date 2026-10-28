# projects-db on the bas box

Self-hosted Postgres for project databases, so projects stop burning Neon compute
hours. Built by LAC-5979 under LAC-5969. No project data has moved yet.

|           |                                                                                 |
| --------- | ------------------------------------------------------------------------------- |
| Host      | `128.140.50.130:26432` (bas box, Hetzner cx33, Falkenstein)                     |
| Container | `projects-db`, `postgres:17-alpine`, `--restart unless-stopped`, 1 GB cap       |
| Data      | `/data/projects-db/data` (bind mount, plain directory on `/`)                   |
| Config    | `/data/projects-db/conf` → `/pgconf:ro` (cert, key, `pg_hba.conf`)              |
| Auth      | `scram-sha-256`, TLS required from off-box                                      |
| Script    | `scripts/bas-projects-db.sh`, installed at `/usr/local/sbin/bas-projects-db.sh` |
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

Measured 2026-10-27 from zero (`107.141.224.67`), all four refusals confirmed:

| Attempt                                       | Result                                  |
| --------------------------------------------- | --------------------------------------- |
| `keepsake` → `keepsake`, `sslmode=require`    | connects                                |
| `keepsake` → `keepsake`, `sslmode=disable`    | `no pg_hba.conf entry … no encryption`  |
| `keepsake` → `shipkit_www`, `sslmode=require` | `no pg_hba.conf entry … SSL encryption` |
| `postgres` → `postgres`, `sslmode=require`    | `no pg_hba.conf entry … SSL encryption` |

The superuser is not reachable from off-box. Reach it over ssh, which matches the
`local … trust` line:

```bash
ssh root@128.140.50.130 docker exec -it projects-db psql -U postgres
```

Vercel egress has no fixed IP range, so there is no source allowlist on
`tcp/26432` (Hetzner firewall `bas-automation`, id 11789519). TLS, scram, and
one hba line per database are the whole access control story. Treat a leaked
project password as a full compromise of that one database.

## Which URL each driver needs

The cert is self-signed, so anything that verifies the chain fails. The answer
per driver:

| Driver                                   | Query string                                      |
| ---------------------------------------- | ------------------------------------------------- |
| `postgres` (postgres-js), `psql` / libpq | `?sslmode=require`                                |
| `pg` (node-postgres)                     | `?sslmode=no-verify`                              |
| Prisma                                   | `?sslmode=require&sslaccept=accept_invalid_certs` |

Two traps, which is why the rest of this section exists.

`sslmode=require` means opposite things in the two Node drivers. libpq and
postgres-js read it as "encrypt, do not verify". node-postgres reads it as
`verify-full` today, and warns that it will switch to libpq semantics in `pg` v9.
Pin the intent instead of the alias.

postgres-js forwards unknown query parameters to the server as startup settings,
so adding `sslaccept` to a postgres-js URL does not get ignored, it fails the
connection with a Postgres error. Only Prisma wants that parameter.

Measured against the live container on 2026-10-27. The Prisma row is carried over
from the `umami-db` note in `~/.openclaw/references/accounts.md` and was not
re-measured, because nothing in scope here uses Prisma.

| Driver                   | Form                                              | Result                                                          |
| ------------------------ | ------------------------------------------------- | --------------------------------------------------------------- |
| `postgres` (postgres-js) | `?sslmode=require`                                | connects                                                        |
| `postgres` (postgres-js) | `?sslmode=no-verify`                              | fails, `DEPTH_ZERO_SELF_SIGNED_CERT`                            |
| `postgres` (postgres-js) | `?sslmode=require&sslaccept=accept_invalid_certs` | fails, `42704 unrecognized configuration parameter "sslaccept"` |
| `pg` (node-postgres)     | `?sslmode=no-verify`                              | connects                                                        |
| `pg` (node-postgres)     | `?uselibpqcompat=true&sslmode=require`            | connects                                                        |
| `pg` (node-postgres)     | `?sslmode=require`                                | fails, `DEPTH_ZERO_SELF_SIGNED_CERT`                            |
| `pg` (node-postgres)     | `ssl: { rejectUnauthorized: false }` in code      | connects                                                        |
| `psql` / libpq           | `?sslmode=require`                                | connects                                                        |
| `psql` / libpq           | `?sslmode=verify-full`                            | fails, no trusted root                                          |

This repo uses `postgres` 3.4.9 with `drizzle-orm`, so the stored `DATABASE_URL`
values use `?sslmode=require` as-is.

## Add a database

```bash
PROJ=my_project   # lowercase, [a-z][a-z0-9_], underscores not hyphens
PW=$(openssl rand -hex 24)
printf '%s\n' "$PW" | ssh root@128.140.50.130 "/usr/local/sbin/bas-projects-db.sh add-project $PROJ"

umask 077
cat > ~/.paperclip/secrets/${PROJ//_/-}-db.env <<EOF
DATABASE_URL=postgresql://$PROJ:$PW@128.140.50.130:26432/$PROJ?sslmode=require
EOF
```

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
DATABASE_URL=postgresql://${PROJ}_preview:$PW@128.140.50.130:26432/${PROJ}_preview?sslmode=require
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
and config directories, the self-signed cert, `pg_hba.conf`, and the container.
It reads the superuser password on stdin so it never lands in argv or shell
history:

```bash
grep '^POSTGRES_PASSWORD=' ~/.paperclip/secrets/projects-db-superuser.env | cut -d= -f2 \
  | ssh root@128.140.50.130 /usr/local/sbin/bas-projects-db.sh bootstrap
ssh root@128.140.50.130 /usr/local/sbin/bas-projects-db.sh verify
```

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
There are no off-box backups of this container today.
