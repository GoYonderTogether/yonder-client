// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { createKeychainStorage } from "./keychain.ts";

const keyring = vi.hoisted(() => ({
	getPassword: vi.fn(async () => "stored-token"),
	setPassword: vi.fn(),
	deletePassword: vi.fn(),
}));
vi.mock("tauri-plugin-keyring-api", () => keyring);

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

test.each([
	{ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)", maxTouchPoints: 1 },
	{ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", maxTouchPoints: 5 },
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

test("a desktop refresh write completes before a later sign-out deletes it", async () => {
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", maxTouchPoints: 0 });
	let finishWrite = () => {};
	keyring.setPassword.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				finishWrite = resolve;
			}),
	);
	const storage = await createKeychainStorage();
	await storage.ready;
	expect(storage.get()).toBe("stored-token");
	const refresh = storage.set("updated-token");
	const signOut = storage.set(null);
	await vi.waitFor(() => expect(keyring.setPassword).toHaveBeenCalledOnce());
	expect(keyring.deletePassword).not.toHaveBeenCalled();
	finishWrite();
	await Promise.all([refresh, signOut]);
	expect(keyring.deletePassword).toHaveBeenCalledWith("dev.yonder.desktop", "refresh-token");
	expect(storage.get()).toBeNull();
});
