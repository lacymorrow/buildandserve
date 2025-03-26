/**
 * Check if a file should be ignored
 * @param filename The filename to check
 * @returns True if the file should be ignored, false otherwise
 */
export function shouldIgnoreFile(filename: string): boolean {
	// Ignore DS_Store files
	if (filename.includes(".DS_Store")) {
		return true;
	}

	// Ignore lock files
	if (
		filename.includes("package-lock.json") ||
		filename.includes("yarn.lock") ||
		filename.includes("pnpm-lock.yaml") ||
		filename.includes(".pnpm-lock.yaml") ||
		filename.includes("npm-shrinkwrap.json") ||
		filename.includes("bun.lockb")
	) {
		return true;
	}

	// Ignore TypeScript environment files
	if (filename.includes("next-env.d.ts")) {
		return true;
	}

	// Ignore configuration files specifically mentioned by the user
	if (
		filename.includes("README.md") ||
		filename.includes("eslint.config") ||
		filename.includes("next.config") ||
		filename.includes("postcss.config") ||
		filename.includes("tsconfig.json")
	) {
		return true;
	}

	// Ignore other common unnecessary files
	if (
		filename.endsWith(".git") ||
		filename.endsWith(".gitignore") ||
		filename.endsWith(".npmrc") ||
		filename.endsWith(".env") ||
		filename.endsWith(".env.local") ||
		filename.endsWith(".env.development") ||
		filename.endsWith(".env.production")
	) {
		return true;
	}

	return false;
}
