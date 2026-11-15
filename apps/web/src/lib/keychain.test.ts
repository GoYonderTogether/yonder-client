// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { createKeychainStorage } from "./keychain.ts";

afterEach(() => {
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
