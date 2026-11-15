import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["apps/**/src/**/*.test.{ts,tsx}", "packages/**/src/**/*.test.{ts,tsx}", "tools/**/*.test.mjs"],
		exclude: ["**/node_modules/**", "**/dist/**"],
		setupFiles: ["test/setup-dom.ts"],
		testTimeout: 20000,
	},
});
