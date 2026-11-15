import { describe, expect, test } from "vitest";
import { createBrowserStorage, createMemoryStorage } from "./index.ts";

/** The smallest thing that behaves like Storage for the adapter. */
function fakeStorage() {
	const map = new Map<string, string>();
	return {
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value),
		removeItem: (key: string) => void map.delete(key),
		key: (index: number) => [...map.keys()][index] ?? null,
		get length() {
			return map.size;
		},
		map,
	};
}

describe("browser storage adapter", () => {
	test("namespaces its keys so it cannot collide with another app on the same origin", () => {
		const raw = fakeStorage();
		const storage = createBrowserStorage(raw);
		storage.set("theme", "dark");
		expect(raw.map.get("yonder.theme")).toBe("dark");
		expect(storage.get("theme")).toBe("dark");
	});

	test("clear removes only its own keys", () => {
		const raw = fakeStorage();
		const storage = createBrowserStorage(raw);
		raw.setItem("someone-else", "keep me");
		storage.set("theme", "dark");
		storage.set("locale", "en");
		storage.clear();
		expect(storage.get("theme")).toBeNull();
		expect(storage.get("locale")).toBeNull();
		expect(raw.map.get("someone-else")).toBe("keep me");
	});

	test("a storage that throws degrades quietly", () => {
		const raw = fakeStorage();
		const storage = createBrowserStorage({
			...raw,
			setItem: () => {
				throw new Error("quota");
			},
		});
		expect(() => storage.set("theme", "dark")).not.toThrow();
		expect(storage.get("theme")).toBeNull();
	});
});

describe("memory storage", () => {
	test("works and clears", () => {
		const storage = createMemoryStorage();
		storage.set("a", "1");
		expect(storage.get("a")).toBe("1");
		storage.remove("a");
		expect(storage.get("a")).toBeNull();
		storage.set("b", "2");
		storage.clear();
		expect(storage.get("b")).toBeNull();
	});
});
