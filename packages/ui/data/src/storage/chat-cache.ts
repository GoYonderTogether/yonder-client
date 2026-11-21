/** Drafts and binary attachments survive a restart; only an explicit account change clears them. */
const DATABASE = "yonder-chat";
let connection: Promise<IDBDatabase> | undefined;
let generation = 0;
export const chatCacheGeneration = () => generation;

function open(): Promise<IDBDatabase> {
	if (!globalThis.indexedDB) return Promise.reject(new Error("local_storage_unavailable"));
	connection ??= new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DATABASE, 1);
		request.onupgradeneeded = () => request.result.createObjectStore("records");
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(new Error("local_storage_blocked"));
	}).catch((error) => {
		connection = undefined;
		throw error;
	});
	return connection;
}

export async function readChatCache<T>(key: string): Promise<T | undefined> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const request = db.transaction("records").objectStore("records").get(key);
		request.onsuccess = () => resolve(request.result as T | undefined);
		request.onerror = () => reject(request.error);
	});
}

export async function writeChatCache(key: string, value: unknown, current = generation): Promise<void> {
	const db = await open();
	if (generation !== current) return;
	return new Promise((resolve, reject) => {
		const transaction = db.transaction("records", "readwrite");
		transaction.objectStore("records").put(value, key);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

export async function updateChatCache<T>(
	key: string,
	update: (value: T | undefined) => T | undefined,
	current = generation,
): Promise<T | undefined> {
	const db = await open();
	if (generation !== current) return;
	return new Promise((resolve, reject) => {
		const transaction = db.transaction("records", "readwrite");
		const store = transaction.objectStore("records");
		const request = store.get(key);
		let value: T | undefined;
		request.onsuccess = () => {
			if (generation !== current) return;
			value = update(request.result as T | undefined);
			if (value === undefined) store.delete(key);
			else store.put(value, key);
		};
		transaction.oncomplete = () => resolve(value);
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

export async function removeChatCache(key: string): Promise<void> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction("records", "readwrite");
		transaction.objectStore("records").delete(key);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
}

export async function listChatCache<T>(prefix: string): Promise<T[]> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const request = db
			.transaction("records")
			.objectStore("records")
			.getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
		request.onsuccess = () => resolve(request.result as T[]);
		request.onerror = () => reject(request.error);
	});
}

export async function clearChatCache(): Promise<void> {
	generation++;
	if (!globalThis.indexedDB) return;
	const db = await open();
	await new Promise<void>((resolve, reject) => {
		const transaction = db.transaction("records", "readwrite");
		transaction.objectStore("records").clear();
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
}

export const attachmentCacheKey = (owner: string, id: string) => `blob:${owner}:${id}`;
export const outboxCacheKey = (owner: string, conversation: string, nonce = "") =>
	`outbox:${owner}:${conversation}:${nonce}`;
