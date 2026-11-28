import {
	attachmentCacheKey,
	chatCacheGeneration,
	LOCAL_OUTBOX_ATTACHMENT,
	openChatCache,
	readChatCache,
	readOutgoingAttachment,
} from "./chat-cache.ts";

export type MediaVariant = "thumb" | "original";
export type MediaResource =
	| { attachmentId: string }
	| { meetingId: string; photoId: string }
	| { meetingId: string; segmentIndex: number };

type MediaEntry = { key: string; bytes: number; accessedAt: number };
type MediaResult = { blob: Blob; cacheError?: true };
export type MediaDownload = {
	sign: () => Promise<{ url: string | null }>;
	local: () => Promise<Blob>;
	kind?: "image" | "audio" | undefined;
	byteLength?: number | undefined;
	signal?: AbortSignal | undefined;
};

const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
function resourceId(resource: MediaResource) {
	if ("attachmentId" in resource) return ["attachment", resource.attachmentId].join(":");
	const meeting = encodeURIComponent(resource.meetingId);
	if ("segmentIndex" in resource) return ["meeting-audio", meeting, resource.segmentIndex].join(":");
	return ["meeting", meeting, encodeURIComponent(resource.photoId)].join(":");
}
const keyFor = (owner: string, resource: MediaResource, variant: MediaVariant, persistent = true) =>
	[chatCacheGeneration(), owner, resourceId(resource), variant, persistent].join("|");
// Keep the existing image records and their LRU index readable across the upgrade.
const indexKey = (owner: string) => ["images-v1", owner].join(":");
const blobKey = (owner: string, resource: MediaResource, variant: MediaVariant) =>
	["image", owner, resourceId(resource), variant === "thumb" ? "thumb-v1" : "original"].join("|");
const pending = new Map<string, { operation: Promise<MediaResult | undefined>; signal?: AbortSignal | undefined }>();
const invalidations = new Map<string, Set<() => void>>();

async function editIndex<T>(
	owner: string,
	generation: number,
	edit: (entries: MediaEntry[], store: IDBObjectStore) => () => T,
): Promise<T | undefined> {
	const db = await openChatCache();
	if (generation !== chatCacheGeneration()) return;
	return new Promise((resolve, reject) => {
		const transaction = db.transaction("records", "readwrite");
		const store = transaction.objectStore("records");
		const key = indexKey(owner);
		const read = store.get(key);
		let result: () => T;
		read.onsuccess = () => {
			if (generation !== chatCacheGeneration()) return;
			const entries: MediaEntry[] = read.result ?? [];
			result = edit(entries, store);
			store.put(entries, key);
		};
		transaction.oncomplete = () => resolve(result?.());
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

export function onMediaInvalidated(
	owner: string,
	resource: MediaResource,
	variant: MediaVariant,
	listener: () => void,
	persistent = true,
) {
	const key = keyFor(owner, resource, variant, persistent);
	const listeners = invalidations.get(key) ?? new Set();
	listeners.add(listener);
	invalidations.set(key, listeners);
	return () => {
		listeners.delete(listener);
		if (!listeners.size && invalidations.get(key) === listeners) invalidations.delete(key);
	};
}

export function discardMedia(owner: string, resources: readonly MediaResource[]): void {
	if (!resources.length) return;
	const variants = ["thumb", "original"] as const;
	const keys = new Set<string>();
	for (const resource of resources) {
		for (const variant of variants) {
			for (const persistent of [true, false]) {
				const key = keyFor(owner, resource, variant, persistent);
				pending.delete(key);
				pending.delete(`${key}|cached`);
				for (const listener of invalidations.get(key) ?? []) listener();
			}
			keys.add(blobKey(owner, resource, variant));
		}
		if ("attachmentId" in resource) keys.add(attachmentCacheKey(owner, resource.attachmentId));
	}
	void editIndex(owner, chatCacheGeneration(), (entries, store) => {
		for (let index = entries.length - 1; index >= 0; index--) {
			const entry = entries[index];
			if (entry && keys.has(entry.key)) entries.splice(index, 1);
		}
		for (const key of keys) store.delete(key);
		return () => {};
	}).catch(() => {});
}

async function downloadMedia({ sign, local, kind, byteLength, signal }: MediaDownload): Promise<Blob> {
	signal?.throwIfAborted();
	const { url } = await sign();
	signal?.throwIfAborted();
	let blob: Blob;
	if (url === null) {
		blob = await local();
	} else {
		const address = new URL(url);
		if (address.protocol !== "https:" || address.username || address.password) throw new Error("invalid_media_url");
		const response = await fetch(address, {
			credentials: "omit",
			cache: "no-store",
			referrerPolicy: "no-referrer",
			...(signal ? { signal } : {}),
		});
		if (response.status !== 200) throw new Error("media_download_failed");
		blob = await response.blob();
	}
	const mime = blob.type.toLowerCase();
	if (
		(kind === "image" && (!blob.size || !mime.startsWith("image/"))) ||
		(kind === "audio" && (!blob.size || (!mime.startsWith("audio/") && mime !== "application/octet-stream"))) ||
		(byteLength !== undefined && blob.size !== byteLength)
	) {
		throw new Error("invalid_media_content");
	}
	return blob;
}

/** Match images, files and recording chunks before requesting a signed download. */
export function loadMedia(
	owner: string,
	resource: MediaResource,
	variant: MediaVariant,
	download?: MediaDownload,
	persistent = true,
): Promise<MediaResult | undefined> {
	const signal = download?.signal;
	if (signal?.aborted) return Promise.reject(signal.reason);
	if ("attachmentId" in resource && resource.attachmentId.startsWith(LOCAL_OUTBOX_ATTACHMENT)) {
		const generation = chatCacheGeneration();
		return readOutgoingAttachment(owner, resource.attachmentId).then((blob) =>
			blob && generation === chatCacheGeneration() && !signal?.aborted ? { blob } : undefined,
		);
	}
	if (!persistent && !download) return Promise.resolve(undefined);
	const identity = keyFor(owner, resource, variant, persistent);
	const key = download ? identity : `${identity}|cached`;
	const existing = pending.get(key);
	if (existing && !existing.signal?.aborted) {
		if (signal === existing.signal) return existing.operation;
		return existing.operation.then(
			(result) => {
				signal?.throwIfAborted();
				if (!result && existing.signal?.aborted) return loadMedia(owner, resource, variant, download, persistent);
				return result;
			},
			(error) => {
				signal?.throwIfAborted();
				if (existing.signal?.aborted) return loadMedia(owner, resource, variant, download, persistent);
				throw error;
			},
		);
	}
	const generation = chatCacheGeneration();
	const binaryKey = blobKey(owner, resource, variant);
	const valid = () =>
		!signal?.aborted && generation === chatCacheGeneration() && pending.get(key)?.operation === operation;
	const operation = (async (): Promise<MediaResult | undefined> => {
		if (!persistent) {
			if (!download) return;
			const blob = await downloadMedia(download);
			return valid() ? { blob } : undefined;
		}
		const cached = await editIndex(owner, generation, (entries, store) => {
			if (!valid()) return () => undefined;
			const originalKey =
				variant === "thumb" && "attachmentId" in resource ? blobKey(owner, resource, "original") : undefined;
			const hit =
				entries.find((entry) => entry.key === binaryKey) ?? entries.find((entry) => entry.key === originalKey);
			if (hit) hit.accessedAt = Date.now();
			const read = store.get(hit?.key ?? binaryKey);
			return () => read.result as Blob | undefined;
		}).catch(() => undefined);
		if (!valid()) return;
		if (cached) return { blob: cached };

		// Locally sent files and downloads from older clients use the old original key.
		const previousKey = "attachmentId" in resource ? attachmentCacheKey(owner, resource.attachmentId) : undefined;
		const previous = previousKey ? await readChatCache<Blob>(previousKey).catch(() => undefined) : undefined;
		if (!valid()) return;
		if (!download) return previous ? { blob: previous } : undefined;
		const blob = previous ?? (await downloadMedia(download));
		if (!valid()) return;
		try {
			await editIndex(owner, generation, (entries, store) => {
				if (!valid() || blob.size > MAX_MEDIA_BYTES) return () => {};
				const index = entries.findIndex((entry) => entry.key === binaryKey);
				if (index >= 0) entries.splice(index, 1);
				store.put(blob, binaryKey);
				if (previous && previousKey && variant === "original") store.delete(previousKey);
				entries.push({ key: binaryKey, bytes: blob.size, accessedAt: Date.now() });
				let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
				if (bytes > MAX_MEDIA_BYTES) {
					entries.sort((a, b) => b.accessedAt - a.accessedAt);
					while (bytes > MAX_MEDIA_BYTES) {
						const oldest = entries.pop();
						if (!oldest) break;
						store.delete(oldest.key);
						bytes -= oldest.bytes;
					}
				}
				return () => {};
			});
			return valid() ? { blob } : undefined;
		} catch {
			return valid() ? { blob, cacheError: true } : undefined;
		}
	})().finally(() => {
		if (pending.get(key)?.operation === operation) pending.delete(key);
	});
	pending.set(key, { operation, signal });
	return operation;
}
