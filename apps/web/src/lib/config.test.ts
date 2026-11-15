import { describe, expect, test } from "vitest";
import { apiBaseUrl, PRODUCTION_API_ORIGIN } from "./config.ts";

describe("apiBaseUrl", () => {
	test("the web uses its own origin, so a relative path", () => {
		expect(apiBaseUrl()).toBe("");
	});

	test("a shell needs an absolute origin, because its page is not served over http", () => {
		expect(apiBaseUrl({ shell: true })).toBe(PRODUCTION_API_ORIGIN);
	});

	test("`tauri dev` loads the page from the dev server, so the shell uses its proxy", () => {
		expect(apiBaseUrl({ shell: true, dev: true })).toBe("");
	});

	test("a self-hosted build uses the configured API origin", () => {
		expect(apiBaseUrl({ shell: true, configuredBase: "https://bot.example.com/" })).toBe("https://bot.example.com");
		expect(apiBaseUrl({ configuredBase: "https://bot.example.com" })).toBe("https://bot.example.com");
		expect(apiBaseUrl({ shell: true, dev: true, configuredBase: "http://127.0.0.1:8090" })).toBe(
			"http://127.0.0.1:8090",
		);
	});

	test("a self-hosted API must be HTTPS outside localhost and cannot contain credentials", () => {
		expect(() => apiBaseUrl({ configuredBase: "http://bot.example.com" })).toThrow(/HTTPS/);
		expect(() => apiBaseUrl({ configuredBase: "https://user:secret@bot.example.com" })).toThrow(/credentials/);
	});
	test("the production origin is https and has no trailing slash", () => {
		expect(PRODUCTION_API_ORIGIN.startsWith("https://")).toBe(true);
		expect(PRODUCTION_API_ORIGIN.endsWith("/")).toBe(false);
	});
});
