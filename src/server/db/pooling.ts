/**
 * Transaction-pooled connections to projects-db (LAC-6076).
 *
 * projects-db has two listeners and they are not interchangeable:
 *
 *   :26433  PgBouncer, transaction pooling   -> DATABASE_URL, the app
 *   :26432  Postgres directly                -> DATABASE_URL_UNPOOLED, migrations and ops
 *
 * The pooled port exists because a server connection stopped being released.
 * Payload builds a node-postgres pool with no `max` so it takes the default of
 * 10, and a frozen Vercel instance cannot run its own idle timer, so it never
 * gives them back. Within a minute of the first cutover one warm instance held
 * all 10 connections of its role, idle, and nothing else could connect at all.
 * An app-side `max: 3` lowers the per-instance number but cannot bound the
 * instance count; only a pooler can.
 *
 * What transaction pooling costs is session state. A server connection goes back
 * to the pool when the transaction ends, so anything that outlives a transaction
 * is gone: `LISTEN`/`NOTIFY`, advisory locks, a `SET` meant to persist, and
 * named prepared statements. The first three are why migrations keep the direct
 * port. The last one is why `prepare: false` exists below.
 *
 * Runbook: docs/ops/bas-projects-db.md
 */

/** The published port of the PgBouncer listener on the bas box. */
const POOLED_PORT = "26433";

const parsePort = (connectionString: string): string | undefined => {
  try {
    // The URL parser needs a protocol it knows; `postgresql:` is opaque to it,
    // so normalise before asking. A malformed URL is not this function's
    // problem -- the driver will report it far better than we would.
    return new URL(connectionString.replace(/^postgres(ql)?:/, "http:")).port || undefined;
  } catch {
    return undefined;
  }
};

/**
 * Whether `connectionString` reaches Postgres through a transaction pooler.
 *
 * Three signals, in order, because no single one is reliable on its own:
 *
 * 1. `DATABASE_POOLED` set explicitly. The escape hatch, and it wins. Needed for
 *    a pooler on a port this file has never heard of.
 * 2. The port is the bas box's pooled listener. Unambiguous when it applies.
 * 3. `DATABASE_URL_UNPOOLED` is set and differs. This is the Neon convention the
 *    repos already carry: if there is a separate unpooled URL, the main one is
 *    the pooled one. Covers any future pooler without touching this file.
 *
 * Deliberately biased toward answering yes. `prepare: false` on a direct
 * connection costs a little performance and nothing else, while a missing
 * `prepare: false` on a pooled one is an intermittent production failure
 * ("prepared statement \"s1\" already exists") that only shows up once two
 * clients land on the same reused server connection.
 */
export const isPooledDatabaseUrl = (
  connectionString: string | undefined,
  environment: NodeJS.ProcessEnv = process.env
): boolean => {
  if (!connectionString) return false;

  const explicit = environment.DATABASE_POOLED?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1") return true;
  if (explicit === "false" || explicit === "0") return false;

  if (parsePort(connectionString) === POOLED_PORT) return true;

  const unpooled = environment.DATABASE_URL_UNPOOLED?.trim();
  return Boolean(unpooled) && unpooled !== connectionString.trim();
};

/**
 * Spread into a postgres-js options object.
 *
 * This is a conservative choice, not a measured necessity, and the distinction
 * matters if you are deciding whether to keep it.
 *
 * The usual reason given -- "transaction pooling and named prepared statements
 * do not coexist" -- is out of date. PgBouncer has tracked protocol-level named
 * prepared statements in transaction mode since 1.21, and `max_prepared_statements`
 * defaults to 200, so it transparently re-prepares a statement on whichever
 * server connection the next transaction lands on. Measured against the live
 * pooler (1.26.1): 24 concurrent queries succeed with and without this option,
 * and so does a statement whose result type changes under it.
 *
 * It stays on anyway, for three reasons that survive that correction:
 *
 *   - it removes any dependence on PgBouncer inspecting and rewriting our
 *     queries, which is where its own documented failure modes live ("cached
 *     plan must not change result type", needing a console `RECONNECT` after a
 *     migration, and SQL-level PREPARE/EXECUTE not being tracked at all)
 *   - a serverless connection is usually too short-lived to amortise a cached
 *     plan, so the performance it gives up is close to nothing here
 *   - the failure it prevents is intermittent and load-dependent, which is the
 *     worst kind to carry into production to save a round trip
 *
 * Reversible: delete the call site and the driver default comes back.
 *
 * Spread rather than `prepare: isPooled(...)` for the same reason
 * `databaseClientTlsOptions` is spread: postgres-js resolves options with
 * `k in o`, so writing the key at all is a decision. Leaving it absent on a
 * direct connection keeps the driver's own default rather than restating it.
 */
export const databasePoolingOptions = (
  connectionString: string | undefined,
  environment: NodeJS.ProcessEnv = process.env
): { prepare: false } | Record<string, never> =>
  isPooledDatabaseUrl(connectionString, environment) ? { prepare: false } : {};

/**
 * The URL to run migrations and other session-scoped work against.
 *
 * Always the direct port when one is configured. A migration through a
 * transaction pooler is not merely slower, it is wrong: drizzle-kit takes an
 * advisory lock to serialise concurrent migrators and an advisory lock is
 * session state, so under transaction pooling it can be taken on one server
 * connection and released from another, or silently never held at all. The
 * same applies to anything using `LISTEN`/`NOTIFY` or a multi-statement `SET`.
 *
 * Falls back to `DATABASE_URL` so a database with no pooler in front of it --
 * every local Postgres, and anything still on Neon's direct endpoint -- keeps
 * working with no configuration at all.
 */
export const migrationDatabaseUrl = (
  environment: NodeJS.ProcessEnv = process.env
): string | undefined => environment.DATABASE_URL_UNPOOLED?.trim() || environment.DATABASE_URL;
