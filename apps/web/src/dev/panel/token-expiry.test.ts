import { expect, test } from "vitest";
import { accessTokenExpiry } from "./token-expiry.ts";

test("reads the real token expiry and handles missing or malformed payloads", () => {
	const payload = btoa(JSON.stringify({ exp: 1_700_000_000 }))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	expect(accessTokenExpiry(`v1.${payload}.signature`)).toBe(1_700_000_000_000);
	expect(accessTokenExpiry("v1.bad.signature")).toBeNull();
	expect(accessTokenExpiry(null)).toBeNull();
});
