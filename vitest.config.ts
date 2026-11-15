import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["apps/**/src/**/*.test.{ts,tsx}", "packages/**/src/**/*.test.{ts,tsx}", "tools/**/*.test.mjs"],
		exclude: ["apps/miniprogram/**", "**/node_modules/**", "**/dist/**"],
		setupFiles: ["test/setup-dom.ts"],
		maxWorkers: 4,
		testTimeout: 20000,
	},
});
