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

`add-project` creates the role with `CONNECTION LIMIT 10` and no `SUPERUSER`,
`CREATEDB` or `CREATEROLE`, creates the database owned by that role, revokes
`CONNECT` from `PUBLIC`, appends the `hostssl` line, and reloads the config. It
is idempotent and will not reset the password of a role that already exists.

The connection limit is the part that matters on a shared box. `max_connections`
is 100; without a per-role cap one runaway app exhausts it and takes every other
project down.

Role and database names use underscores even when the project name has a hyphen,
so nothing ever needs SQL quoting: project `shipkit-www` is role and database
`shipkit_www`, and its secret file keeps the hyphenated name.

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

## Not done yet

Backups, the fleet-health reachability and backup-age check, and the
rotate-a-password and restore-from-backup procedures all belong to LAC-5969.
There are no off-box backups of this container today.
