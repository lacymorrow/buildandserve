# projects-db backups, restores and the watcher

Off-box backups for the project databases on the bas box, the restore procedure that
has actually been run, password rotation, and the four fleet-health cards that say
when any of it stops. Built by LAC-5980 under LAC-5969.

The box, the TLS story, the per-driver URL table, adding a database, and the
connection-limit policy are in [`bas-projects-db.md`](./bas-projects-db.md). This
file does not repeat them.

|            |                                                                           |
| ---------- | ------------------------------------------------------------------------- |
| Script     | `scripts/projects-db-backup.sh` → `/usr/local/bin/projects-db-backup.sh`  |
| Schedule   | `projects-db-backup.timer`, nightly 02:40 local, `RandomizedDelaySec=300` |
| On box     | `/data/backups/projects/YYYYMMDD/`, kept 7 days                           |
| On NAS     | `library:/mnt/user/backups/projects-db-bas/YYYYMMDD/`, kept 14 days       |
| Credential | `/etc/paperclip/library_backup_ed25519` on the box, `root@100.119.64.141` |
| Watcher    | `fleet-health-check.sh` on graphite, four keys, every 15 minutes          |

## Push, not pull

[LAC-5969](https://github.com/lacymorrow/buildandserve) asked for a NAS-side pull
script. This pushes instead. The box already pushes chatwoot and the Paperclip
database to the same NAS through the same key, so this copies a pattern that works
rather than provisioning a second rrsync key on the NAS. The template is
`/usr/local/bin/chatwoot-backup.sh` (LAC-4165) and the shape is the same: dump, local
prune, rsync, remote prune, `chown`, `logger`.

The NAS prune runs **on the NAS**, deliberately. A prune driven from the box stops
happening the moment the tunnel or the box dies, which is exactly when the NAS copy
is the only copy and is quietly growing without limit.

## What gets dumped

One `pg_dump -Fc` per database, plus a globals file:

```
globals-YYYYMMDD-HHMM.sql          pg_dumpall --globals-only
<db>-YYYYMMDD-HHMM.dump            pg_dump -Fc, one per database
```

The globals file is not decoration. A `-Fc` dump of one database carries its tables
and its `OWNER TO <role>` statements but not the role itself, so restoring into a
rebuilt container with no roles fails on the first owner line. That file carries the
roles and their scram verifiers, which is why the whole tree is mode 600 under
`umask 077` and why the pushed copy is too.

`postgres` is skipped. It is the maintenance database and holds no project data.

The script counts what it dumped against the number of databases it found and refuses
to report success on a mismatch. That check exists because the first version used
`while read` over a herestring and `docker exec -i` drained the loop's stdin: it
dumped 1 of 4 databases, exited 0, and wrote `ok` to syslog. Measured on the box
2026-10-28.

## Prove the restore

A dump nobody has restored is not a backup, so the proof is a subcommand rather than
a step somebody did once:

```bash
ssh root@bas.hyrax-boga.ts.net /usr/local/bin/projects-db-backup.sh verify-restore gracefully_imagined
```

It restores the newest local dump into `<db>_restorecheck`, compares exact row counts
per table against the live database, and drops the scratch. On a mismatch it leaves
the scratch in place and prints the diff, because dropping it would destroy the only
copy of what went wrong.

Run 2026-10-28 against `gracefully_imagined`, the database carrying live client data:

```
11:39:11Z verify-restore: gracefully_imagined from /data/backups/projects/20261028/gracefully_imagined-20261028-0738.dump into gracefully_imagined_restorecheck
11:39:11Z restored ... -> gracefully_imagined_restorecheck
11:39:11Z verify-restore PASS: 50 tables match exactly
payload.faqs 8
payload.media 2
payload.projects 1
payload.projects_gallery 2
payload.rbac 34
payload.rbac_rels 43
payload.users 2
payload.users_sessions 10
...
11:39:11Z verify-restore: dropped gracefully_imagined_restorecheck
```

Per-table counts rather than one total, because a total passes with rows moved between
tables, and a table-count comparison passes on a schema-only restore.

## Restore one database from a NAS dump

Pull the dump to the box, restore it beside the live database, then rename. There is
no flag that restores over a live database: `restore` refuses a target that already
exists, so the only available procedure is the one that can be aborted halfway.

```bash
ssh root@bas.hyrax-boga.ts.net
SSHK="ssh -i /etc/paperclip/library_backup_ed25519 -o BatchMode=yes -o ConnectTimeout=25"

# 1. what is on the NAS
$SSHK root@100.119.64.141 ls -la /mnt/user/backups/projects-db-bas/

# 2. pull the one you want
umask 077; mkdir -p /tmp/restore
rsync -a -e "$SSHK" \
  root@100.119.64.141:/mnt/user/backups/projects-db-bas/20261028/gracefully_imagined-20261028-0738.dump \
  /tmp/restore/

# 3. restore beside the live database
/usr/local/bin/projects-db-backup.sh restore \
  /tmp/restore/gracefully_imagined-20261028-0738.dump gracefully_imagined_new

# 4. check it before you swap
docker exec -i projects-db psql -U postgres -At -d gracefully_imagined_new \
  -c 'select count(*) from payload.users'

# 5. swap. Stop the app's traffic first; a rename needs no other session connected.
docker exec -i projects-db psql -U postgres <<'SQL'
ALTER DATABASE gracefully_imagined RENAME TO gracefully_imagined_old;
ALTER DATABASE gracefully_imagined_new RENAME TO gracefully_imagined;
ALTER DATABASE gracefully_imagined OWNER TO gracefully_imagined;
SQL

rm -rf /tmp/restore
```

Two things that bite here.

`restore` passes `--no-owner`, so objects land owned by `postgres`. Step 5's `ALTER
DATABASE ... OWNER TO` fixes the database, not its tables. If the app connects as the
project role and gets permission errors, reassign inside the database:

```bash
docker exec -i projects-db psql -U postgres -d gracefully_imagined \
  -c 'REASSIGN OWNED BY postgres TO gracefully_imagined'
```

A rename fails while any session is connected to either database. Vercel holds warm
connections, so expect to pause the deployment or wait out the idle timeout rather
than to retry the rename in a loop.

Proven 2026-10-28, end to end: the NAS copy of `gracefully_imagined` pulled, restored
into a fresh database, and compared against the source.

```
gi_nas_proof             rbac=34 rbac_rels=43 users=2 faqs=8 sessions=10
gracefully_imagined      rbac=34 rbac_rels=43 users=2 faqs=8 sessions=10
```

And the guard, same session:

```
$ projects-db-backup.sh restore .../gracefully_imagined-20261028-0738.dump gracefully_imagined
projects-db-backup: database 'gracefully_imagined' already exists; restore beside it and rename, never over it
exit=1
```

## Rotate a project password

`add-project` deliberately will not reset the password of a role that already exists,
so rotation is by hand. Four steps, and the order matters: the database accepts both
old and new only for as long as it takes to update Vercel, which is to say it does
not, so plan a redeploy.

```bash
PROJ=gracefully_imagined            # role and database name, underscores
VPROJ=gracefully-imagined           # Vercel project name, hyphens
PW=$(openssl rand -hex 24)

# 1. the database
ssh root@bas.hyrax-boga.ts.net \
  docker exec -i projects-db psql -U postgres -c "ALTER ROLE $PROJ PASSWORD '$PW'"

# 2. the secret of record on zero
umask 077
sed -i '' "s#//$PROJ:[^@]*@#//$PROJ:$PW@#g" ~/.paperclip/secrets/${PROJ//_/-}-db.env

# 3. Vercel, all three environments, then redeploy. Vercel reads env vars at build
#    time for some frameworks and at request time for others, and a running function
#    keeps the old value either way, so the redeploy is not optional.
URL=$(grep '^DATABASE_URL=' ~/.paperclip/secrets/${PROJ//_/-}-db.env | cut -d= -f2-)
for ENV in production preview development; do
  vercel env rm DATABASE_URL "$ENV" --yes --scope lacymorrows-projects --cwd /path/to/$VPROJ
  printf '%s' "$URL" | vercel env add DATABASE_URL "$ENV" --scope lacymorrows-projects --cwd /path/to/$VPROJ
done
vercel --prod --scope lacymorrows-projects --cwd /path/to/$VPROJ

# 4. confirm the old password is dead
psql "postgresql://$PROJ:<OLD>@bas.hyrax-boga.ts.net:26432/$PROJ?sslmode=require" -c 'select 1'
```

Step 4 is the step people skip. A rotation that left the old password working is not a
rotation, and the only way to know is to try it.

Preview roles rotate the same way against `${PROJ}_preview` and the
`<project>-preview-db.env` secret. Client certificates (LAC-6060) are separate from
the password and are reissued with `bas-projects-db.sh client-cert <proj>`.

## The watcher: four cards

In `fleet-health-check.sh` on graphite, section 1b, gated on the same
`~/.paperclip/fleet-health/bas-enabled` marker as the rest of the bas box. Tests are
`test/lac5980-projects-db-test.sh`, 94 assertions.

| Card                           | Fails when                                                  | First thing to look at                              |
| ------------------------------ | ----------------------------------------------------------- | --------------------------------------------------- |
| `projects-db`                  | a real project database does not answer `SELECT 1` over TLS | `docker logs --tail 50 projects-db`, then `df -h /` |
| `projects-db-backup`           | the newest `*.dump` on the NAS is over 26h old              | `journalctl -u projects-db-backup.service -n 50`    |
| `projects-db-connections`      | client backends pass 60 of `max_connections=100`            | `pg_stat_activity` grouped by `usename`             |
| `projects-db-role-connections` | any role is at 80% or more of its own `rolconnlimit`        | that app's pool cap                                 |

Four keys and not one, because any one of them alone lies. A box that answers while
its backups stopped a week ago reads healthy on reachability. A role at its own cap is
down for one app while the cluster reads calm, which is the outage that reached Lacy as
a 500 on a site.

`projects-db-backup` is judged **on the NAS**, not on the box, for the same reason
`bas-backup` is: a box that is gone cannot report that it has stopped backing up. It
reads the tree with `find -type f -name '*.dump'` rather than `ls -t | head -1`,
because the backup mirrors a `YYYYMMDD/` directory per night and the newest entry of
the top directory is a directory whose mtime is not any dump's age.

The reachability probe dials the server and authenticates rather than asking the box
about itself through `docker exec`. A port that accepts TCP but refuses auth is still
down.

It dials the **tailnet** name, not the public one. The public port is mid-change under
LAC-6059 and LAC-6060, so a probe there would alarm on a planned rollout instead of on
an outage. What that does not cover is a public-port-only break, where the tailnet is
fine and Vercel cannot connect. Closing that gap needs a client certificate for the
watcher and is filed as a follow-up. Everything else that "the database is gone" means
in practice fails this probe: container down, disk full, Postgres wedged, scram broken,
box dead.

`psql` exiting 0 is not treated as a successful probe. It can print a prefix of its
result and exit 0, so the query ends with a sentinel row and a reading without that row
is reported as unreadable rather than healthy.

The role card reads `rolconnlimit` from the database and does not assume 25 and 5.
Holdovers from the gracefully-imagined cutover are live right now (`gracefully_imagined`
at 30, the preview roles at 10), so a hardcoded denominator would report the wrong
percentage for every one of them. `rolconnlimit` is `-1` for a role with no limit, and
that row is skipped rather than judged: `digits()` strips the sign, so without the skip
an unlimited role reads as a limit of 1 and files a card on its first connection.

### The watcher's credential

A role with no data access, so a leak of the fleet-health host cannot read client rows:

```sql
CREATE ROLE fleet_monitor LOGIN;
ALTER ROLE fleet_monitor NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE fleet_monitor CONNECTION LIMIT 3;
ALTER ROLE fleet_monitor PASSWORD '<openssl rand -hex 24>';
GRANT CONNECT ON DATABASE gracefully_imagined TO fleet_monitor;
```

Plus one `pg_hba.conf` line, tailnet only:

```
hostssl gracefully_imagined      fleet_monitor        100.64.0.0/10  scram-sha-256
```

It gets `CONNECT` on one project database and `USAGE` on no schema, so it can read
`pg_catalog` and `pg_stat_activity` and not one row of anything else. Measured
2026-10-28 from zero, five ways:

| Attempt                                               | Result                                 |
| ----------------------------------------------------- | -------------------------------------- |
| `select 1` on `gracefully_imagined` over the tailnet  | connects                               |
| the saturation query (`pg_stat_activity`, `pg_roles`) | reads                                  |
| `select count(*) from payload.users`                  | `permission denied for schema payload` |
| the same credential against `keepsake`                | `no pg_hba.conf entry`                 |
| `sslmode=disable` over the tailnet                    | `no pg_hba.conf entry … no encryption` |
| the same credential from the public IP                | `no pg_hba.conf entry`                 |

The credential lives at `~/.paperclip/secrets/projects-db-monitor.env` on zero and
graphite, mode 600. A host without it logs a `SKIP projects-db` every run and files no
card, which is the `bas-enabled` rule: an unprovisioned watcher is not allowed to hide
quietly, and it is not allowed to alarm either.

`ensure_hba` in `bas-projects-db.sh` only writes `pg_hba.conf` when the file is absent,
so this line survives a re-`bootstrap`. A rebuild from an empty `/data` does not, and
the SQL above is what to re-run then.

## Blast radius

The bas box is a single Hetzner cx33 in Falkenstein, server id `169986608`, with delete
and rebuild protection on. Every project database on it has one live copy and one NAS
copy up to 24h old. If the box dies:

- Every site whose `DATABASE_URL` points at `26432` returns 500 on any database read.
- `projects-db` and `projects-db-backup` both fail inside 15 minutes.
- Recovery is: new box, `bas-projects-db.sh bootstrap`, re-run the `fleet_monitor` SQL
  above, then `restore` each database from the newest NAS dump plus the globals file.
- Up to 24h of writes are gone. These are low-write content sites, so that is a
  deliberate trade against hourly dumps, not an oversight.

The NAS is the other single point. It is one Unraid box on the LAN and it is where the
only off-box copy lives, so a fire takes both. There is no third copy and no offsite.
That is a known gap, not a solved problem.

## What this does not do

- No point-in-time recovery. These are nightly dumps, not WAL archiving.
- No public-port reachability card. See the tailnet note above.
- No offsite copy. Box plus one NAS on the same LAN.
- No automatic restore. `verify-restore` proves a dump is restorable; it does not
  fail over anything.
