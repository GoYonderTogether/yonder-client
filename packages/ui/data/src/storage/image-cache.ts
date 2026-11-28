import { attachmentCacheKey, chatCacheGeneration, openChatCache, readChatCache } from "./chat-cache.ts";

export type ImageVariant = "thumb" | "original";
export type ImageResource = { attachmentId: string } | { meetingId: string; photoId: string };

type ImageEntry = { key: string; bytes: number; accessedAt: number };
type ImageResult = { blob: Blob; cacheError?: true };

const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
const resourceId = (resource: ImageResource) =>
	"attachmentId" in resource
		? ["attachment", resource.attachmentId].join(":")
		: ["meeting", encodeURIComponent(resource.meetingId), encodeURIComponent(resource.photoId)].join(":");
const keyFor = (owner: string, resource: ImageResource, variant: ImageVariant, persistent = true) =>
	[chatCacheGeneration(), owner, resourceId(resource), variant, persistent].join("|");
const indexKey = (owner: string) => ["images-v1", owner].join(":");
const blobKey = (owner: string, resource: ImageResource, variant: ImageVariant) =>
	["image", owner, resourceId(resource), variant === "thumb" ? "thumb-v1" : "original"].join("|");
const pending = new Map<string, Promise<ImageResult | undefined>>();
const invalidations = new Map<string, Set<() => void>>();

async function editIndex<T>(
	owner: string,
	generation: number,
	edit: (entries: ImageEntry[], store: IDBObjectStore) => () => T,
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
			const entries: ImageEntry[] = read.result ?? [];
			result = edit(entries, store);
			store.put(entries, key);
		};
		transaction.oncomplete = () => resolve(result?.());
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

export function onImageInvalidated(
	owner: string,
	resource: ImageResource,
	variant: ImageVariant,
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

export function discardImages(owner: string, resources: readonly ImageResource[]): void {
	if (!resources.length) return;
	const variants = ["thumb", "original"] as const;
	const keys = new Set<string>();
	for (const resource of resources) {
		for (const variant of variants) {
			for (const persistent of [true, false]) {
				const key = keyFor(owner, resource, variant, persistent);
				pending.delete(key);
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

async function downloadImage(sign: () => Promise<{ url: string | null }>, local: () => Promise<Blob>): Promise<Blob> {
	const { url } = await sign();
	if (url === null) return local();
	const address = new URL(url);
	if (address.protocol !== "https:" || address.username || address.password) throw new Error("invalid_media_url");
	const response = await fetch(address, { credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
	if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/"))
		throw new Error("image_download_failed");
	const blob = await response.blob();
	if (!blob.size) throw new Error("empty_image");
	return blob;
}

/** Shared by every image entry point; the signer is called only after a persistent miss. */
export function loadImage(
	owner: string,
	resource: ImageResource,
	variant: ImageVariant,
	sign: () => Promise<{ url: string | null }>,
	local: () => Promise<Blob>,
	persistent = true,
): Promise<ImageResult | undefined> {
	const key = keyFor(owner, resource, variant, persistent);
	const existing = pending.get(key);
	if (existing) return existing;
	const generation = chatCacheGeneration();
	const binaryKey = blobKey(owner, resource, variant);
	const valid = () => generation === chatCacheGeneration() && pending.get(key) === operation;
	const operation = (async (): Promise<ImageResult | undefined> => {
		if (!persistent) {
			const blob = await downloadImage(sign, local);
			return valid() ? { blob } : undefined;
		}
		const cached = await editIndex(owner, generation, (entries, store) => {
			if (!valid()) return () => undefined;
			const hit = entries.find((entry) => entry.key === binaryKey);
			if (hit) hit.accessedAt = Date.now();
			const read = store.get(binaryKey);
			return () => read.result as Blob | undefined;
		}).catch(() => undefined);
		if (!valid()) return;
		if (cached) return { blob: cached };

		// Preserve locally sent images and originals downloaded before the image cache was introduced.
		const previous =
			"attachmentId" in resource
				? await readChatCache<Blob>(attachmentCacheKey(owner, resource.attachmentId)).catch(() => undefined)
				: undefined;
		if (!valid()) return;
		const blob = previous ?? (await downloadImage(sign, local));
		if (!valid()) return;
		try {
			await editIndex(owner, generation, (entries, store) => {
				if (!valid() || blob.size > MAX_MEDIA_BYTES) return () => {};
				const index = entries.findIndex((entry) => entry.key === binaryKey);
				if (index >= 0) entries.splice(index, 1);
				store.put(blob, binaryKey);
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
		if (pending.get(key) === operation) pending.delete(key);
	});
	pending.set(key, operation);
	return operation;
}
