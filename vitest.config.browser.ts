import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	plugins: [react(), tsconfigPaths()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		include: ["tests/browser/**/*.test.{ts,tsx}"],
		watch: false,
		browser: {
			enabled: true,
			name: "chromium",
			provider: "playwright",
			// https://playwright.dev
			providerOptions: {},
		},
	},
});
