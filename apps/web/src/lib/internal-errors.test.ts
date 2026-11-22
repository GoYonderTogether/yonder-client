// @vitest-environment jsdom
import { ApiError } from "@yonder/api-client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
	internalErrorPilot,
	reportNavigationFailure,
	reportProviderAddFailure,
	setInternalErrorConsent,
} from "./internal-errors.ts";

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubEnv("VITE_INTERNAL_ERROR_BUILD", "pilot-01");
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(null, { status: 204 })),
	);
});
afterEach(() => {
	setInternalErrorConsent(false);
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

test("requires a dedicated build and explicit consent", async () => {
	reportNavigationFailure();
	await vi.advanceTimersByTimeAsync(1100);
	expect(fetch).not.toHaveBeenCalled();
	vi.stubEnv("VITE_INTERNAL_ERROR_BUILD", "");
	expect(internalErrorPilot()).toBe(false);
	expect(setInternalErrorConsent(true)).toBe(false);
});

test("batches only allowlisted structured errors and transmits no credentials or referrer", async () => {
	setInternalErrorConsent(true);
	reportNavigationFailure();
	reportNavigationFailure();
	reportProviderAddFailure(
		"save",
		new ApiError({ status: 503, code: "internal", message: "private key", requestId: "private id" }),
		performance.now(),
	);
	reportProviderAddFailure("save", new DOMException("private", "AbortError"), performance.now());
	expect(fetch).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1100);
	expect(fetch).toHaveBeenCalledExactlyOnceWith(
		"/v1/internal/error-reports",
		expect.objectContaining({
			credentials: "omit",
			referrerPolicy: "no-referrer",
			redirect: "error",
			headers: { "content-type": "application/json" },
		}),
	);
	const calls = vi.mocked(fetch).mock.calls;
	expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
		version: 1,
		build: "pilot-01",
		platform: "web",
		errors: [
			{ action: "navigation", phase: "render", reason: "boundary_failure", duration: "unknown", count: 2 },
			{ action: "provider_add", phase: "save", reason: "api_5xx", duration: "under_1s", count: 1 },
		],
	});
});

test("withdrawal discards queued samples; a failed transport is not reported or retried", async () => {
	vi.mocked(fetch).mockRejectedValue(new Error("transport"));
	setInternalErrorConsent(true);
	reportNavigationFailure();
	setInternalErrorConsent(false);
	await vi.advanceTimersByTimeAsync(1100);
	expect(fetch).not.toHaveBeenCalled();
	setInternalErrorConsent(true);
	reportNavigationFailure();
	await vi.advanceTimersByTimeAsync(10_000);
	expect(fetch).toHaveBeenCalledTimes(1);
});
