// Environment setup for tests
// This handles both browser and Node.js environments

// Set test-specific environment variables
process.env = {
	...process.env,
	NODE_ENV: "test",
	SKIP_ENV_VALIDATION: "1",
};

// Only load Next.js environment config in Node.js environment
// Browser environments already have environment variables processed at build time
if (typeof window === "undefined") {
	try {
		// Dynamic import to avoid browser compatibility issues
		import("@next/env")
			.then(({ loadEnvConfig }) => {
				loadEnvConfig(process.cwd());
			})
			.catch((error) => {
				console.warn("Error loading environment variables:", error);
			});
	} catch (error) {
		console.warn("Error importing @next/env:", error);
	}
}
