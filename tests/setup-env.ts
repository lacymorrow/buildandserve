// Import Next.js environment variable loader
import { loadEnvConfig } from "@next/env";

// Load environment variables from .env* files
const projectDir = process.cwd();
loadEnvConfig(projectDir);

// Mock environment variables
process.env = {
	...process.env,
	NODE_ENV: "test",
	SKIP_ENV_VALIDATION: "1",
	// Use test database URL if available, otherwise use a mock URL for type checking
	DATABASE_URL:
		process.env.TEST_DATABASE_URL ||
		process.env.DATABASE_URL ||
		"postgres://test:test@localhost:5432/test",
};

// Export whether we have a real database connection
export const hasDatabase = !!(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
