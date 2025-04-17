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
};