// import "server-only";

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import { databaseClientTlsOptions } from "./client-tls";
import { databasePoolingOptions } from "./pooling";
import * as schema from "./schema";

// Configure postgres with proper options for production workloads
const client = env.DATABASE_URL
  ? postgres(env.DATABASE_URL, {
      max: 3, // Increase connection pool for concurrent operations
      connect_timeout: 30, // Longer timeout for heavy operations
      idle_timeout: 30, // Longer idle timeout
      max_lifetime: 60 * 30, // 30 minutes max lifetime
      // TLS comes from the connection string and nowhere else. There used to be
      // an `ssl: { rejectUnauthorized: false }` here for development, which was
      // the worst place to have it: development is a laptop on whatever network
      // it is on, reaching the database across the public internet, which is the
      // on-path attack this is supposed to stop (LAC-6054). It also forced TLS on
      // with verification off for every dev connection, including ones whose URL
      // never asked for TLS. Neon never needed it either; their certs are
      // publicly trusted.
      //
      // projects-db URLs carry `?sslmode=verify-full`. If a local database
      // serves a certificate nothing trusts, fix the URL for that database
      // rather than turning verification off for all of them.
      transform: {
        undefined: null, // Transform undefined values to null
        ...({} as Record<string, never>), // Empty transform object
      },
      // A client certificate when one is configured, nothing at all when it is
      // not (LAC-6060). Spread rather than `ssl: ...` on purpose: postgres-js
      // treats an explicit `ssl: undefined` as a value and it beats the URL's
      // `sslmode=verify-full`, which turns TLS off entirely. See client-tls.ts.
      ...databaseClientTlsOptions(),
      // `prepare: false` when this URL goes through PgBouncer (LAC-6076), so
      // nothing here depends on the pooler inspecting and rewriting our queries.
      // Detected from the URL rather than asked for, because the failures it
      // avoids are intermittent and load-dependent. pooling.ts has the measured
      // reasoning, including why the usual justification for this is out of date.
      ...databasePoolingOptions(env.DATABASE_URL),
    })
  : undefined;

export const db = client ? drizzle(client, { schema }) : undefined;

// Export a function to check if the database is initialized and connected - Prefer checking db instead
export const isDatabaseInitialized = async () => {
  if (!db) return false;
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
};

/**
 * Safe database execution utility
 * Executes a database operation only if the database is initialized
 * Returns a default value if the database is not available
 *
 * @param callback - The database operation to execute
 * @param defaultValue - The value to return if database is not initialized
 * @returns Promise<T> - The result of the callback or the default value
 */
export const safeDbExecute = async <T>(
  callback: (db: PostgresJsDatabase<typeof schema>) => Promise<T>,
  defaultValue: T
): Promise<T> => {
  if (!db) {
    console.warn("Database not initialized, returning default value");
    return defaultValue;
  }

  try {
    return await callback(db);
  } catch (error) {
    console.error("Database operation failed:", error);
    return defaultValue;
  }
};

// Export schema for direct usage
export * from "./schema";

export { schema };
