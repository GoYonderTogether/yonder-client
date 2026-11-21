export interface MeetingPhoto {
	id: string;
	ownerId: string;
	recordingId: string;
	elapsedMs: number;
	image: Blob;
}

export const MEETING_PHOTO_LIMIT = 20;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const pending = new Map<string, Set<Promise<unknown>>>();

let opening: Promise<IDBDatabase> | undefined;

function database() {
	// A separate store avoids upgrading or blocking the live audio journal for a camera operation.
	opening ??= new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open("yonder-meeting-photos", 1);
		request.onupgradeneeded = () => {
			request.result
				.createObjectStore("photos", { keyPath: ["ownerId", "recordingId", "id"] })
				.createIndex("recording", ["ownerId", "recordingId"]);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	}).catch((error) => {
		opening = undefined;
		throw error;
	});
	return opening;
}

export async function saveMeetingPhoto(photo: MeetingPhoto) {
	if (photo.image.type !== "image/jpeg" || !photo.image.size || photo.image.size > MAX_PHOTO_BYTES)
		throw new Error("photo_invalid");
	const db = await database();
	const transaction = db.transaction("photos", "readwrite", { durability: "strict" });
	return new Promise<void>((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onabort = () => reject(transaction.error);
		const store = transaction.objectStore("photos");
		const count = store.index("recording").count([photo.ownerId, photo.recordingId]);
		count.onsuccess = () => {
			if (count.result >= MEETING_PHOTO_LIMIT) transaction.abort();
			else store.add(photo);
		};
	});
}

export async function listMeetingPhotos(ownerId: string, recordingId: string): Promise<MeetingPhoto[]> {
	const db = await database();
	const request = db.transaction("photos").objectStore("photos").index("recording").getAll([ownerId, recordingId]);
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result.sort((a, b) => a.elapsedMs - b.elapsedMs));
		request.onerror = () => reject(request.error);
	});
}

/** Register at shutter time, before asynchronous encoding, so a native Stop can wait for the photo. */
export function archiveMeetingPhoto(
	ownerId: string,
	recordingId: string,
	elapsedMs: number,
	image: Promise<Blob>,
): Promise<MeetingPhoto> {
	const key = JSON.stringify([ownerId, recordingId]);
	const existing = pending.get(key) ?? new Set();
	pending.set(key, existing);
	const id = crypto.randomUUID();
	const operation = image.then(async (blob) => {
		const photo = { id, ownerId, recordingId, elapsedMs: Math.max(0, Math.round(elapsedMs)), image: blob };
		await saveMeetingPhoto(photo);
		return photo;
	});
	existing.add(operation);
	return operation.finally(() => {
		existing.delete(operation);
		if (!existing.size) pending.delete(key);
	});
}

/** The server treats the same photo ID and bytes idempotently, including after a process restart. */
export async function drainMeetingPhotos(
	ownerId: string,
	recordingId: string,
	upload: (photo: MeetingPhoto) => Promise<unknown>,
): Promise<number> {
	await Promise.allSettled(pending.get(JSON.stringify([ownerId, recordingId])) ?? []);
	const photos = await listMeetingPhotos(ownerId, recordingId);
	for (const photo of photos) await upload(photo);
	return photos.length;
}
