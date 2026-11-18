import { ApiError } from "@yonder/api-client";
import { expect, test, vi } from "vitest";

vi.mock("@tarojs/taro", () => ({
	default: { getStorageSync: () => "en", getSystemInfoSync: () => ({ language: "en" }), setStorageSync: () => {} },
}));

import { accountFailure } from "./failure";

const failure = (code: string, details?: Record<string, unknown>) =>
	new ApiError({ code: code as never, status: 400, message: "for developers", ...(details ? { details } : {}) });

test("each failure is explained by its code, never by the developer message or a handle mismatch", () => {
	expect(accountFailure(failure("code_invalid", { remainingAttempts: 4 }))).toBe(
		"That code is not right. 4 tries left.",
	);
	expect(accountFailure(failure("rate_limited", { retryAfter: 30 }))).toBe(
		"Too many attempts. Try again in 30 seconds.",
	);
	expect(accountFailure(failure("internal"))).toBe("That did not work. Please try again.");
	expect(accountFailure(failure("invalid_request", { field: "code" }))).not.toContain("ID");
	expect(accountFailure(failure("invalid_request", { field: "confirmHandle" }))).toBe("That does not match your ID");
	expect(accountFailure(new TypeError("offline"))).toBe("Could not reach the server. Check your connection.");
});
