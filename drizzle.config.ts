import type { Config } from "drizzle-kit";

import { migrationDatabaseUrl } from "./src/server/db/pooling";

const prefix = process.env.DB_PREFIX ?? "";
export default {
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // The direct port, never the pooler (LAC-6076). drizzle-kit takes an
    // advisory lock to serialise concurrent migrators, and an advisory lock is
    // session state: under transaction pooling it can be taken on one server
    // connection and released from another, or never actually held. Falls back
    // to DATABASE_URL when no pooler is configured. See src/server/db/pooling.ts.
    url: migrationDatabaseUrl() ?? "",
  },
  tablesFilter: [`${prefix}_*`],
  out: "./src/migrations",
  verbose: true,
  strict: true,
} satisfies Config;
