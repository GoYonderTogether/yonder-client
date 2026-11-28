import Taro from "@tarojs/taro";
import { isNewChatHistoryCutoff, mergeMessage } from "@yonder/chat-model";
import type { MemoryDayPage, MemoryEntry, MessagePage, ServerEvent } from "@yonder/protocol";

export const MINI_CACHE_PREFIX = "yonder.mini.history.v1.";
export const METADATA_FRESH_MS = 30_000;
const MAX_PAGES = 40;
const source = typeof YONDER_API_BASE === "undefined" ? "https://yonder.zethai.cn" : YONDER_API_BASE;

interface Snapshot<T> {
	data: T;
	savedAt: number;
}

export function metadataKey(owner: string, kind: "messages" | "timeline" | "memory", key = "", page = "") {
	return [MINI_CACHE_PREFIX.slice(0, -1), source, owner, kind, key, page]
		.map((part, index) => (index === 0 ? part : encodeURIComponent(part).replaceAll(".", "%2E")))
		.join(".");
}

function storedSnapshot<T>(key: string): Snapshot<T> | undefined {
	try {
		const snapshot = Taro.getStorageSync(key);
		if (snapshot && typeof snapshot.savedAt === "number") return snapshot;
	} catch {
		// The page can still load from the server.
	}
}

function timelineEntries(page: MemoryDayPage) {
	return page.items.flatMap((day) =>
		day.blocks.flatMap((block) => (block.type === "entry" ? [block.entry] : block.stay.entries)),
	);
}

export function timelineSnapshot(page: MemoryDayPage): MemoryDayPage {
	const secrets = new Set(
		timelineEntries(page)
			.filter(({ visibility }) => visibility === "secret")
			.map(({ id }) => id),
	);
	if (!secrets.size) return page;
	const safe = (entry: MemoryEntry): MemoryEntry[] =>
		secrets.has(entry.id) ? [] : [{ ...entry, links: entry.links.filter(({ entryId }) => !secrets.has(entryId)) }];
	const items = page.items.flatMap((day) => {
		const blocks = day.blocks.flatMap<(typeof day.blocks)[number]>((block) => {
			if (block.type === "entry") return safe(block.entry).map((entry) => ({ type: "entry", entry }));
			const entries = block.stay.entries.flatMap(safe);
			return entries.length ? [{ ...block, stay: { ...block.stay, entries } }] : [];
		});
		if (!blocks.length && day.blocks.length) return [];
		return [
			{
				...day,
				blocks,
				digest: {
					...day.digest,
					photos: blocks.reduce(
						(count, block) =>
							count +
							(block.type === "entry"
								? block.entry.mediaCount
								: block.stay.entries.reduce((sum, entry) => sum + entry.mediaCount, 0)),
						0,
					),
				},
			},
		];
	});
	return { ...page, items };
}

function snapshotData<T>(key: string, value: T): T {
	return key.startsWith(MINI_CACHE_PREFIX) && key.slice(MINI_CACHE_PREFIX.length).split(".")[2] === "timeline"
		? (timelineSnapshot(value as MemoryDayPage) as T)
		: value;
}

export function readSnapshot<T>(key: string): Snapshot<T> | undefined {
	const stored = storedSnapshot<T>(key);
	if (!stored) return;
	try {
		const data = snapshotData(key, stored.data);
		return data === stored.data ? stored : { data, savedAt: 0 };
	} catch {
		return undefined;
	}
}

export function purgeSecretTimelineSnapshots(owner: string, invalidate: (ids: Iterable<string>) => void): void {
	const prefix = metadataKey(owner, "timeline").slice(0, -1);
	const secret = new Set<string>();
	const retained = new Set<string>();
	try {
		for (const key of Taro.getStorageInfoSync().keys) {
			if (!key.startsWith(prefix)) continue;
			const stored = storedSnapshot<MemoryDayPage>(key);
			if (!stored) continue;
			for (const entry of timelineEntries(stored.data)) {
				const ids = entry.visibility === "secret" ? secret : retained;
				for (const { attachment } of [...entry.media, ...entry.materials]) if (attachment) ids.add(attachment.id);
			}
			const data = timelineSnapshot(stored.data);
			if (data !== stored.data) {
				Taro.removeStorageSync(key);
				Taro.setStorageSync(key, { data, savedAt: 0 });
			}
		}
	} catch {
		// A partially available store still cannot surface secret entries through readSnapshot.
	}
	invalidate([...secret].filter((id) => !retained.has(id)));
}

export function updateSnapshots<T>(prefix: string, update: (value: T) => T | undefined) {
	try {
		for (const key of Taro.getStorageInfoSync().keys) {
			if (!key.startsWith(prefix)) continue;
			const snapshot = readSnapshot<T>(key);
			if (!snapshot) continue;
			const data = update(snapshot.data);
			if (data === undefined) Taro.removeStorageSync(key);
			else if (data !== snapshot.data) Taro.setStorageSync(key, { ...snapshot, data });
		}
	} catch {
		// The in-memory source remains current when local persistence is unavailable.
	}
}

export function expireSnapshots<T>(prefix: string, matches: (value: T, key: string) => boolean) {
	try {
		for (const key of Taro.getStorageInfoSync().keys) {
			if (!key.startsWith(prefix)) continue;
			const snapshot = readSnapshot<T>(key);
			if (snapshot && matches(snapshot.data, key)) Taro.setStorageSync(key, { ...snapshot, savedAt: 0 });
		}
	} catch {
		// A mounted page can still refresh from its realtime subscription.
	}
}

export function timelinePageAffected(page: MemoryDayPage, dates: string[] | undefined, latest: boolean) {
	if (!dates || !page.items.length) return true;
	const bounds = page.items.map(({ date }) => date).sort();
	const oldest = bounds[0];
	const newest = bounds.at(-1);
	return dates.some((date) => (!oldest || date >= oldest || !page.nextCursor) && (latest || !newest || date <= newest));
}

export function writeSnapshot<T>(key: string, data: T): void {
	try {
		const pages = Taro.getStorageInfoSync().keys.filter((name) => name.startsWith(MINI_CACHE_PREFIX) && name !== key);
		const oldest = pages.map((name) => ({ name, at: readSnapshot(name)?.savedAt ?? 0 })).sort((a, b) => a.at - b.at);
		for (const { name } of oldest.slice(0, Math.max(0, oldest.length - MAX_PAGES + 1))) Taro.removeStorageSync(name);
	} catch {
		// Saving can still work if the host does not expose a storage inventory.
	}
	try {
		const value = snapshotData(key, data);
		Taro.setStorageSync(key, { data: value, savedAt: value === data ? Date.now() : 0 });
	} catch {
		// Metadata is a best-effort snapshot, so it never blocks drafts or message rendering.
	}
}

export function updateMetadataForEvent(
	owner: string,
	event: ServerEvent,
	invalidateAttachmentMedia: (ids: Iterable<string>) => void,
	clearConversationMedia: () => void,
): void {
	if (event.type === "message.created" || event.type === "message.updated") {
		const message = event.message;
		let hadMessage = false;
		updateSnapshots<MessagePage>(metadataKey(owner, "messages", message.conversationId), (page) => {
			const previous = page.items.find(({ id }) => id === message.id);
			if (!previous) return page;
			hadMessage = true;
			if (previous.version > message.version) return page;
			const kept = new Set(message.recalled ? [] : message.attachments.map(({ id }) => id));
			invalidateAttachmentMedia(previous.attachments.filter(({ id }) => !kept.has(id)).map(({ id }) => id));
			return { ...page, items: page.items.map((row) => (row.id === message.id ? mergeMessage(row, message) : row)) };
		});
		if (!hadMessage) {
			if (event.type === "message.updated" && message.recalled) clearConversationMedia();
			expireSnapshots<MessagePage>(metadataKey(owner, "messages", message.conversationId), () => true);
		}
	}
	if (event.type === "conversation.removed" || event.type === "conversation.updated") {
		const id = event.type === "conversation.removed" ? event.conversationId : event.conversation.id;
		const lost = event.type === "conversation.removed" || event.conversation.closedReason === "removed";
		const cutoff = event.type === "conversation.updated" ? event.conversation.historyClearedThrough : undefined;
		updateSnapshots<MessagePage>(metadataKey(owner, "messages", id), (page) => {
			if (!lost && (!cutoff || !isNewChatHistoryCutoff(cutoff, page.historyClearedThrough))) return page;
			invalidateAttachmentMedia(page.items.flatMap((message) => message.attachments.map(({ id }) => id)));
			return undefined;
		});
	}
	if (event.type === "memory.changed") {
		if (event.dates || !event.paths)
			expireSnapshots<MemoryDayPage>(metadataKey(owner, "timeline").slice(0, -1), (page, key) =>
				timelinePageAffected(page, event.dates, key.endsWith(".")),
			);
		if (event.paths) {
			for (const path of event.paths) expireSnapshots(metadataKey(owner, "memory", path), () => true);
		} else if (!event.dates) expireSnapshots(metadataKey(owner, "memory").slice(0, -1), () => true);
	}
}
