import { describe, expect, test } from "vitest";
import { createMemoryTokenStore } from "./token-store.ts";

describe("memory token store", () => {
	test("holds the access token in memory", () => {
		const store = createMemoryTokenStore();
		expect(store.getAccessToken()).toBeNull();
		store.setAccessToken("abc");
		expect(store.getAccessToken()).toBe("abc");
		store.setAccessToken(null);
		expect(store.getAccessToken()).toBeNull();
	});

	test("has no refresh token on the web, where the cookie carries it", () => {
		const store = createMemoryTokenStore();
		expect(store.getRefreshToken?.()).toBeNull();
		store.setRefreshToken?.("ignored");
		expect(store.getRefreshToken?.()).toBeNull();
	});

	test("a shell's keychain storage takes over the refresh half", () => {
		let keychain: string | null = null;
		const store = createMemoryTokenStore().withRefreshStorage({
			get: () => keychain,
			set: (value) => {
				keychain = value;
			},
		});
		store.setRefreshToken?.("rt_1");
		expect(store.getRefreshToken?.()).toBe("rt_1");
		expect(keychain).toBe("rt_1");
	});

	test("never writes to localStorage", () => {
		const writes: string[] = [];
		const original = globalThis.localStorage;
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				setItem: (key: string) => writes.push(key),
				getItem: () => null,
				removeItem: () => {},
			},
		});
		try {
			const store = createMemoryTokenStore();
			store.setAccessToken("secret");
			expect(writes).toEqual([]);
		} finally {
			Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
		}
	});
});
