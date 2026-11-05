/**
 * Client-certificate TLS for projects-db (LAC-6060).
 *
 * projects-db listens on `tcp/26432` open to the whole internet, because Vercel
 * egress has no fixed IP range and a Vercel function can join neither a tailnet
 * nor a TCP tunnel (LAC-6056). That leaves a password as the only thing between
 * the internet and the database. A client certificate is the access control
 * that is actually available: Postgres checks it before SCRAM runs, so a leaked
 * password on its own stops being a way in.
 *
 * The certificate arrives as two base64 environment variables, decoded here.
 * Base64 because a multi-line PEM pasted into a Vercel environment variable is
 * the standard way this breaks: the dashboard keeps the newlines, the build
 * does not, and the failure surfaces as an opaque TLS error.
 *
 * Both variables unset is the normal state for a database that does not require
 * a certificate, including every local Postgres and anything still on Neon.
 * Nothing here turns on unless both are present.
 *
 * Runbook: docs/ops/bas-projects-db.md
 */

export interface DatabaseClientCertificate {
  cert: string;
  key: string;
}

const decode = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const pem = Buffer.from(value.trim(), "base64").toString("utf8").trim();
  // A value that was pasted as a raw PEM rather than base64 round-trips through
  // Buffer.from as garbage instead of throwing, so check the result looks like
  // a PEM rather than trusting the decode.
  return pem.startsWith("-----BEGIN ") ? pem : undefined;
};

/**
 * The `ssl` option for postgres-js, or `undefined` when no client certificate
 * is configured.
 *
 * Deliberately no `ca`. The server certificate is Let's Encrypt and the client
 * verifies it against Node's built-in trust store; passing our private CA here
 * would *replace* that store rather than add to it, and every connection would
 * fail with `unable to get local issuer certificate`. Measured, not assumed.
 *
 * Nothing sets `rejectUnauthorized`. Node defaults it to true and postgres-js
 * sets `servername` from the host, which together is exactly `verify-full`.
 */
export const databaseClientCertificate = (
  environment: NodeJS.ProcessEnv = process.env
): DatabaseClientCertificate | undefined => {
  const cert = decode(environment.DATABASE_CLIENT_CERT_B64);
  const key = decode(environment.DATABASE_CLIENT_KEY_B64);
  // One without the other is a half-finished deployment. Returning a partial
  // object would hand the driver a config it cannot use and produce a TLS error
  // that names neither variable.
  if (!cert || !key) return undefined;
  return { cert, key };
};

/**
 * Spread into a postgres-js options object.
 *
 * Spread rather than `ssl: databaseClientCertificate()`, and that is the whole
 * point of this helper. postgres-js resolves options with `k in o`, so an
 * explicit `ssl: undefined` counts as *set* and beats the `sslmode=verify-full`
 * in the URL. TLS is then off entirely and the connection is refused by
 * `pg_hba.conf` with "no encryption", which reads like a server problem.
 */
export const databaseClientTlsOptions = (
  environment: NodeJS.ProcessEnv = process.env
): { ssl: DatabaseClientCertificate } | Record<string, never> => {
  const certificate = databaseClientCertificate(environment);
  return certificate ? { ssl: certificate } : {};
};

/**
 * The `pg` pool config for a connection string: the URL plus a client
 * certificate when one is configured, and nothing changed when one is not.
 *
 * This is the entry point `pg` callers should use, rather than composing
 * `withoutSslMode` and `databaseClientCertificate` themselves, because the
 * safe order is not the obvious one. Stripping `sslmode` unconditionally
 * would be a silent TLS **downgrade** on every database that has no client
 * certificate: `pg` with neither `sslmode` nor an `ssl` object does not
 * negotiate TLS at all. The strip is only correct in company with the `ssl`
 * object that replaces it, so the two happen together or not at all.
 *
 * Used by both Postgres clients in this repo, which is the point. The Drizzle
 * client and Payload's pool read the same `DATABASE_URL`, and a certificate
 * wired into one but not the other means the app works and the CMS is gone.
 */
export const nodePostgresConnection = (
  connectionString: string | undefined,
  environment: NodeJS.ProcessEnv = process.env
): { connectionString: string | undefined; ssl?: DatabaseClientCertificate } => {
  const certificate = databaseClientCertificate(environment);
  if (!certificate || !connectionString) return { connectionString };
  return { connectionString: withoutSslMode(connectionString), ssl: certificate };
};

/**
 * node-postgres only: remove `sslmode` from a connection string.
 *
 * `pg` merges a parsed `connectionString` *over* the explicit config
 * (`connection-parameters.js`: `Object.assign({}, config, parse(...))`), so
 * `sslmode=verify-full` in the URL silently discards an `ssl: { cert, key }`
 * passed alongside it. The certificate is never sent and the server answers
 * "connection requires a valid client certificate", which points at the server
 * rather than at the driver. Measured against the live box.
 *
 * Dropping `sslmode` loses nothing: with an `ssl` object, Node verifies the
 * chain and the hostname by default. Both halves were re-measured by breaking
 * them on purpose (a CA that did not sign the server cert, and a bare IP).
 *
 * postgres-js does not need this. It resolves the explicit option first, so the
 * URL and the `ssl` object coexist.
 */
export const withoutSslMode = (connectionString: string): string => {
  const [base, query] = connectionString.split("?");
  if (!query) return connectionString;
  const parameters = new URLSearchParams(query);
  parameters.delete("sslmode");
  const rest = parameters.toString();
  return rest ? `${base}?${rest}` : (base as string);
};
