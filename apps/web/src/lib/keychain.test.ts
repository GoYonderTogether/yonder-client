// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { createKeychainStorage } from "./keychain.ts";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

afterEach(() => {
	invoke.mockReset();
	vi.unstubAllGlobals();
	localStorage.clear();
});

// The refresh token lives in the OS credential store through native commands, so the tests drive
// `invoke`. Both changes here are about that one path: HEAD made it the only desktop path, main made
// a refresh write and a later sign-out run in call order.

test.each([
	{ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)", maxTouchPoints: 1 },
	{ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", maxTouchPoints: 5 },
	{ userAgent: "Mozilla/5.0 (iPad; CPU OS 19_0 like Mac OS X)", maxTouchPoints: 5 },
])("a mobile shell keeps the refresh token in its sandboxed storage ($userAgent)", async (navigator) => {
	vi.stubGlobal("navigator", navigator);
	const storage = await createKeychainStorage();
	await storage.ready;
	expect(storage.get()).toBeNull();
	storage.set("token-1");
	expect((await createKeychainStorage()).get()).toBe("token-1");
	storage.set(null);
	expect(storage.get()).toBeNull();
});

test("desktop restores, replaces and removes only the existing session token", async () => {
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh)", maxTouchPoints: 0 });
	invoke.mockResolvedValue(undefined).mockResolvedValueOnce("saved-session");
	const storage = await createKeychainStorage();
	await storage.ready;
	expect(storage.get()).toBe("saved-session");
	await storage.set("refreshed-session");
	expect(storage.get()).toBe("refreshed-session");
	await storage.set(null);
	expect(storage.get()).toBeNull();
	expect(invoke.mock.calls).toEqual([
		["get_desktop_refresh_token"],
		["set_desktop_refresh_token", { value: "refreshed-session" }],
		["set_desktop_refresh_token", { value: null }],
	]);
	expect(localStorage.length).toBe(0);
});

test("missing or denied desktop credentials leave sign-in available", async () => {
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)", maxTouchPoints: 0 });
	invoke.mockRejectedValueOnce(new Error("unavailable"));
	const denied = await createKeychainStorage();
	await denied.ready;
	expect(denied.get()).toBeNull();
	invoke.mockResolvedValueOnce(null);
	const missing = await createKeychainStorage();
	await missing.ready;
	expect(missing.get()).toBeNull();
	expect(invoke.mock.calls).toEqual([["get_desktop_refresh_token"], ["get_desktop_refresh_token"]]);
});

test("a desktop refresh write completes before a later sign-out deletes it", async () => {
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", maxTouchPoints: 0 });
	let finishWrite = () => {};
	invoke.mockImplementation(async (command: string, payload?: { value: string | null }) => {
		if (command === "get_desktop_refresh_token") return "stored-token";
		if (payload?.value === "updated-token") {
			await new Promise<void>((resolve) => {
				finishWrite = resolve;
			});
		}
		return undefined;
	});
	const storage = await createKeychainStorage();
	await storage.ready;
	expect(storage.get()).toBe("stored-token");
	const refresh = storage.set("updated-token");
	const signOut = storage.set(null);
	await vi.waitFor(() =>
		expect(invoke.mock.calls.filter((call) => call[1]?.value === "updated-token")).toHaveLength(1),
	);
	// The sign-out is queued behind the write that is still pending, so it has not reached the store yet.
	expect(invoke.mock.calls.some((call) => call[1]?.value === null)).toBe(false);
	finishWrite();
	await Promise.all([refresh, signOut]);
	expect(invoke.mock.calls.at(-1)).toEqual(["set_desktop_refresh_token", { value: null }]);
	expect(storage.get()).toBeNull();
});
