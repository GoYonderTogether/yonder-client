/**
 * Platform storage behind one interface (08 第十一节). A feature calls `storage.get/set/remove`
 * and never learns whether it is localStorage, a Tauri store, or nothing at all.
 *
 * `localStorage` throws in a private window on some browsers, so every access is guarded and a
 * failure degrades to memory rather than breaking the page.
 */
export interface Storage {
	get(key: string): string | null;
	set(key: string, value: string): void;
	remove(key: string): void;
	/** Remove everything this app stored. Used when signing out. */
	clear(): void;
}

export function createMemoryStorage(): Storage {
	const values = new Map<string, string>();
	return {
		get: (key) => values.get(key) ?? null,
		set: (key, value) => void values.set(key, value),
		remove: (key) => void values.delete(key),
		clear: () => values.clear(),
	};
}

export function createBrowserStorage(
	source: Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">,
): Storage {
	const prefix = "yonder.";
	const owned = () => {
		const names: string[] = [];
		for (let index = 0; index < source.length; index += 1) {
			const name = source.key(index);
			if (name?.startsWith(prefix)) names.push(name);
		}
		return names;
	};
	return {
		get(key) {
			try {
				return source.getItem(`${prefix}${key}`);
			} catch {
				return null;
			}
		},
		set(key, value) {
			try {
				source.setItem(`${prefix}${key}`, value);
			} catch {
				// Quota or a locked store: the app keeps working from memory.
			}
		},
		remove(key) {
			try {
				source.removeItem(`${prefix}${key}`);
			} catch {
				// Nothing to do.
			}
		},
		clear() {
			for (const name of owned()) {
				try {
					source.removeItem(name);
				} catch {
					// Nothing to do.
				}
			}
		},
	};
}

/** localStorage when it works, memory when it does not. Never throws. */
export function createDefaultStorage(): Storage {
	try {
		const candidate = globalThis.localStorage;
		if (!candidate) return createMemoryStorage();
		const probe = "yonder.probe";
		candidate.setItem(probe, "1");
		candidate.removeItem(probe);
		return createBrowserStorage(candidate);
	} catch {
		return createMemoryStorage();
	}
}
