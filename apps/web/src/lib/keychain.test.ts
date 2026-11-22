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

test("a mobile shell keeps the refresh token in its sandboxed storage", async () => {
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)" });
	const storage = await createKeychainStorage();
	await storage.ready;
	expect(storage.get()).toBeNull();
	storage.set("token-1");
	expect((await createKeychainStorage()).get()).toBe("token-1");
	storage.set(null);
	expect(storage.get()).toBeNull();
});

test("desktop restores, replaces and removes only the existing session token", async () => {
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh)" });
	invoke.mockResolvedValue(undefined).mockResolvedValueOnce("saved-session");
	const storage = await createKeychainStorage();
	await storage.ready;
	expect(storage.get()).toBe("saved-session");
	storage.set("refreshed-session");
	expect(storage.get()).toBe("refreshed-session");
	storage.set(null);
	expect(storage.get()).toBeNull();
	expect(invoke.mock.calls).toEqual([
		["get_desktop_refresh_token"],
		["set_desktop_refresh_token", { value: "refreshed-session" }],
		["set_desktop_refresh_token", { value: null }],
	]);
	expect(localStorage.length).toBe(0);
});

test("missing or denied desktop credentials leave sign-in available", async () => {
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)" });
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
