import {
	createDefaultStorage,
	createMemoryStorage,
	readLocale,
	readStyleChoice,
	readThemeChoice,
	type Storage,
} from "@yonder/ui-data";

/** Auxiliary caches stay private; only device appearance and language seed the new window. */
export function createContactStorage(source: Pick<Storage, "get"> = createDefaultStorage()): Storage {
	const storage = createMemoryStorage();
	storage.set("locale", readLocale(source));
	storage.set("theme", readThemeChoice(source));
	storage.set("style", readStyleChoice(source));
	return storage;
}
