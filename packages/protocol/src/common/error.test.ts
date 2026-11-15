import { describe, expect, test } from "vitest";
import { ERROR_CODES } from "./error.ts";

describe("error codes", () => {
	test("are unique", () => {
		expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
	});

	test("use snake_case so they read the same in logs and in JSON", () => {
		for (const code of ERROR_CODES) expect(code).toMatch(/^[a-z]+(_[a-z]+)*$/);
	});

	test("cover the auth failures the login flow depends on", () => {
		for (const code of ["code_invalid", "code_expired", "code_rate_limited", "password_invalid", "refresh_reused"]) {
			expect(ERROR_CODES).toContain(code);
		}
	});
});
