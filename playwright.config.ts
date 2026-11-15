import { defineConfig } from "@playwright/test";

const baseURL = `http://127.0.0.1:${process.env.E2E_PORT ?? "4180"}`;

/** Public client checks: no private cloud, database, credentials or real account is needed. */
export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
	projects: [{ name: "chromium", use: { channel: "chromium" } }],
	webServer: {
		command: "node scripts/e2e/serve.mjs",
		url: `${baseURL}/`,
		reuseExistingServer: false,
		timeout: 30_000,
	},
});
