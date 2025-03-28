import { loadEnvConfig } from "@next/env";

// Load environment variables from .env* files
const projectDir = process.cwd();
loadEnvConfig(projectDir);

// Export for use in scripts
export default loadEnvConfig;
