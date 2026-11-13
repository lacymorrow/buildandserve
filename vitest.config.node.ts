import react from "@vitejs/plugin-react";
import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/shims/server-only.ts"),
      "next/server": path.resolve(__dirname, "./tests/shims/next-server.ts"),
      "next/link": path.resolve(__dirname, "./tests/shims/next-link.tsx"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup-env.ts", "./tests/setup.ts"],
    include: ["tests/node/**/*.test.{ts,tsx}"],
    watch: false,
    // A timeout is a hang guard, not a speed assertion. The ops suite spawns real
    // git worktrees and shell scripts; under local load they measured 7.4s against
    // the 5s default and flaked (LAC-8066). Passing tests pay nothing for headroom.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/**", "src/test/**", "**/*.d.ts", "**/*.config.ts", "**/types/**"],
    },
  },
});
