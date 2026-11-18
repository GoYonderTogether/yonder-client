import type { MeetingRecording } from "@yonder/feature-meetings";

let opening: Promise<IDBDatabase> | undefined;

function database() {
	opening ??= new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open("yonder-meeting-recorder", 1);
		request.onupgradeneeded = () => {
			const records = request.result.createObjectStore("records", { keyPath: ["ownerId", "id"] });
			records.createIndex("owner", "ownerId");
			request.result.createObjectStore("audio");
		};
		request.onerror = () => reject("storage_failed");
		request.onsuccess = () => resolve(request.result);
	}).catch((cause) => {
		opening = undefined;
		throw cause;
	});
	return opening;
}

function result<T>(request: IDBRequest<T>) {
	return new Promise<T>((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject("storage_failed");
	});
}

export async function listBrowserMeetings(ownerId: string): Promise<MeetingRecording[]> {
	const db = await database();
	return result(db.transaction("records").objectStore("records").index("owner").getAll(ownerId));
}

export async function saveBrowserMeeting(record: MeetingRecording, parts: Uint8Array<ArrayBuffer>[] = []) {
	const db = await database();
	const tx = db.transaction(["records", "audio"], "readwrite", { durability: "strict" });
	const done = new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onabort = () => reject("storage_failed");
	});
	tx.objectStore("records").put(record);
	for (const [offset, bytes] of parts.entries()) {
		tx.objectStore("audio").put(bytes, [record.ownerId, record.id, record.segments.length - parts.length + offset]);
	}
	await done;
}

export async function readBrowserMeeting(ownerId: string, id: string, index: number): Promise<Uint8Array> {
	const db = await database();
	const bytes = await result(db.transaction("audio").objectStore("audio").get([ownerId, id, index]));
	if (!(bytes instanceof Uint8Array)) throw "audio_unavailable";
	return bytes;
}
