import { defineConfig } from "@playwright/test";

/** Public client checks: no private cloud, database, credentials or real account is needed. */
export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	use: { baseURL: "http://127.0.0.1:4180", trace: "retain-on-failure", screenshot: "only-on-failure" },
	projects: [{ name: "chromium", use: { channel: "chromium" } }],
	webServer: {
		command: "node scripts/e2e/serve.mjs",
		url: "http://127.0.0.1:4180/",
		reuseExistingServer: false,
		timeout: 30_000,
	},
});
