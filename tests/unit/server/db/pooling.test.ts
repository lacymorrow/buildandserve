/**
 * Transaction-pooled connections to projects-db (LAC-6076).
 *
 * The two failures these guard against are both silent until they are not:
 *
 *   - a missing `prepare: false` on a pooled URL surfaces as an intermittent
 *     'prepared statement "s1" already exists', and only once two clients land
 *     on the same reused server connection, so it passes every smoke test.
 *   - a migration run through the pooler takes drizzle-kit's advisory lock on
 *     one server connection and can release it from another, so concurrent
 *     migrators stop being serialised while every individual run still reports
 *     success.
 */

import { describe, expect, it } from "vitest";
import {
  databasePoolingOptions,
  isPooledDatabaseUrl,
  migrationDatabaseUrl,
} from "@/server/db/pooling";

const POOLED = "postgresql://role:pw@projects-db.cloud0.dev:26433/db?sslmode=verify-full";
const DIRECT = "postgresql://role:pw@projects-db.cloud0.dev:26432/db?sslmode=verify-full";

const envWith = (overrides: Record<string, string | undefined>) =>
  overrides as unknown as NodeJS.ProcessEnv;

describe("isPooledDatabaseUrl", () => {
  it("recognises the pooled listener by port", () => {
    expect(isPooledDatabaseUrl(POOLED, envWith({}))).toBe(true);
  });

  it("leaves the direct port alone", () => {
    expect(isPooledDatabaseUrl(DIRECT, envWith({}))).toBe(false);
  });

  it("treats a separate unpooled URL as proof the main one is pooled", () => {
    // The Neon convention the repos already carry. Covers a pooler on a port
    // this module has never heard of without needing an edit.
    expect(
      isPooledDatabaseUrl(
        "postgresql://role:pw@pooler.example:5432/db",
        envWith({
          DATABASE_URL_UNPOOLED: "postgresql://role:pw@direct.example:5432/db",
        })
      )
    ).toBe(true);
  });

  it("does not call a URL pooled when the unpooled URL is the same string", () => {
    // A repo that sets both names to one value has no pooler, it has one
    // database spelled twice.
    expect(isPooledDatabaseUrl(DIRECT, envWith({ DATABASE_URL_UNPOOLED: DIRECT }))).toBe(false);
  });

  it("ignores surrounding whitespace when comparing the two URLs", () => {
    expect(isPooledDatabaseUrl(DIRECT, envWith({ DATABASE_URL_UNPOOLED: `  ${DIRECT}  ` }))).toBe(
      false
    );
  });

  it("lets DATABASE_POOLED force it on", () => {
    expect(isPooledDatabaseUrl(DIRECT, envWith({ DATABASE_POOLED: "true" }))).toBe(true);
    expect(isPooledDatabaseUrl(DIRECT, envWith({ DATABASE_POOLED: "1" }))).toBe(true);
  });

  it("lets DATABASE_POOLED force it off, beating both other signals", () => {
    // The escape hatch has to win, or there is no way out of a wrong guess.
    expect(
      isPooledDatabaseUrl(
        POOLED,
        envWith({
          DATABASE_POOLED: "false",
          DATABASE_URL_UNPOOLED: DIRECT,
        })
      )
    ).toBe(false);
  });

  it("is false for no URL at all", () => {
    expect(isPooledDatabaseUrl(undefined, envWith({}))).toBe(false);
  });

  it("does not throw on a malformed URL", () => {
    // The driver reports a bad connection string far better than this would.
    expect(isPooledDatabaseUrl("not a url", envWith({}))).toBe(false);
  });
});

describe("databasePoolingOptions", () => {
  it("returns prepare: false for a pooled URL", () => {
    expect(databasePoolingOptions(POOLED, envWith({}))).toEqual({ prepare: false });
  });

  it("returns an empty object, never prepare: undefined, for a direct URL", () => {
    // postgres-js resolves options with `k in o`, so an explicit
    // `prepare: undefined` is *set* and overrides the driver's own default.
    // The key has to be absent, not undefined.
    const options = databasePoolingOptions(DIRECT, envWith({}));
    expect(options).toEqual({});
    expect("prepare" in options).toBe(false);
  });
});

describe("migrationDatabaseUrl", () => {
  it("prefers the direct URL when one is configured", () => {
    expect(
      migrationDatabaseUrl(envWith({ DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: DIRECT }))
    ).toBe(DIRECT);
  });

  it("falls back to DATABASE_URL when nothing is pooled", () => {
    expect(migrationDatabaseUrl(envWith({ DATABASE_URL: DIRECT }))).toBe(DIRECT);
  });

  it("falls back when the unpooled variable is present but empty", () => {
    // A Vercel environment variable that exists with an empty value is the
    // normal state of a half-finished cutover, and must not produce an empty
    // migration URL.
    expect(migrationDatabaseUrl(envWith({ DATABASE_URL: DIRECT, DATABASE_URL_UNPOOLED: "" }))).toBe(
      DIRECT
    );
  });

  it("is undefined when there is no database at all", () => {
    expect(migrationDatabaseUrl(envWith({}))).toBeUndefined();
  });

  it("throws rather than hand back a pooled URL as the migration target", () => {
    // Cutover runbook step 3 asks for DATABASE_URL and DATABASE_URL_UNPOOLED in
    // one Vercel edit, so "pointed at the pooler, forgot the direct one" is the
    // likely half-finished state. Falling back silently would migrate through a
    // transaction pooler, where drizzle-kit's advisory lock stops serialising
    // concurrent migrators while every run still reports success.
    expect(() => migrationDatabaseUrl(envWith({ DATABASE_URL: POOLED }))).toThrow(
      /DATABASE_URL_UNPOOLED/
    );
  });

  it("throws when DATABASE_POOLED says pooled, whatever the port looks like", () => {
    expect(() =>
      migrationDatabaseUrl(envWith({ DATABASE_URL: DIRECT, DATABASE_POOLED: "true" }))
    ).toThrow(/pooled/i);
  });

  it("does not throw for a pooled-looking URL that DATABASE_POOLED declares direct", () => {
    // The escape hatch has to work here too, or a pooler on 26433 that is in
    // fact a direct listener has no way to run a migration.
    expect(migrationDatabaseUrl(envWith({ DATABASE_URL: POOLED, DATABASE_POOLED: "false" }))).toBe(
      POOLED
    );
  });

  it("prefers the direct URL and never throws when both are set", () => {
    expect(
      migrationDatabaseUrl(envWith({ DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: DIRECT }))
    ).toBe(DIRECT);
  });
});
