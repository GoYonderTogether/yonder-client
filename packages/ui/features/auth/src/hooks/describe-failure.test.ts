import { ApiError, NetworkError } from "@yonder/ui-data";
import { describe, expect, test } from "vitest";
import { describeFailure } from "./describe-failure.ts";

/** Echo the key and its first variable, so the assertion is about which message was chosen. */
const t = (key: string, options?: Record<string, unknown>): string => {
	const first = options ? Object.values(options)[0] : undefined;
	return first === undefined ? key : `${key}:${String(first)}`;
};

describe("describeFailure", () => {
	test("a network failure says to check the connection", () => {
		expect(describeFailure(new NetworkError(new Error("offline")), t).text).toBe("auth.errors.network");
	});

	test("a wrong code carries how many tries are left", () => {
		const error = new ApiError({
			code: "code_invalid",
			status: 422,
			message: "wrong",
			details: { remainingAttempts: 3 },
		});
		const result = describeFailure(error, t);
		expect(result.text).toBe("auth.errors.codeInvalid:3");
		expect(result.field).toBe("code");
	});

	test("a rate limit carries the wait", () => {
		const error = new ApiError({
			code: "code_rate_limited",
			status: 429,
			message: "slow down",
			details: { retryAfter: 42 },
		});
		expect(describeFailure(error, t).text).toBe("auth.errors.codeRateLimited:42");
	});

	test("a password problem points at the password field", () => {
		const error = new ApiError({ code: "password_invalid", status: 422, message: "wrong" });
		expect(describeFailure(error, t)).toEqual({ text: "auth.errors.passwordInvalid", field: "password" });
	});

	test("a short password points at the new password field", () => {
		const error = new ApiError({
			code: "invalid_request",
			status: 400,
			message: "short",
			details: { field: "newPassword", reason: "too_short" },
		});
		expect(describeFailure(error, t)).toEqual({ text: "auth.errors.passwordTooShort", field: "newPassword" });
	});

	test("an unknown error still says something", () => {
		expect(describeFailure(new Error("boom"), t).text).toBe("auth.errors.unknown");
	});

	test("an unmapped API code falls back to the shared error table", () => {
		const error = new ApiError({ code: "account_suspended", status: 403, message: "suspended" });
		expect(describeFailure(error, t).text).toBe("errors.account_suspended");
	});
});
