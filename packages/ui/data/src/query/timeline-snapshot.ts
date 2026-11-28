import type { InfiniteData } from "@tanstack/react-query";
import type { MemoryDayPage, MemoryEntry } from "@yonder/protocol";

export type TimelinePage = MemoryDayPage & { cacheTimeZone: string | null };
export type TimelineSnapshot = InfiniteData<TimelinePage, string | undefined>;
const TIMELINE_SNAPSHOT_LIMIT = 512 * 1024;

export function deviceTimeZone(): string | undefined {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
	} catch {
		return undefined;
	}
}

export function timelineSnapshot(data: unknown): TimelineSnapshot | undefined {
	const timeline = data as TimelineSnapshot | undefined;
	if (!Array.isArray(timeline?.pages) || !Array.isArray(timeline?.pageParams)) return;
	return timeline;
}

export function entrySnapshot(data: TimelineSnapshot): TimelineSnapshot {
	const secrets = new Set<string>();
	for (const page of data.pages)
		for (const day of page.items)
			for (const block of day.blocks)
				for (const entry of block.type === "entry" ? [block.entry] : block.stay.entries)
					if (entry.visibility === "secret") secrets.add(entry.id);
	const safeEntry = (entry: MemoryEntry): MemoryEntry[] =>
		secrets.has(entry.id) ? [] : [{ ...entry, links: entry.links.filter(({ entryId }) => !secrets.has(entryId)) }];
	const pages = [];
	let size = 0;
	for (const page of data.pages) {
		const clean = !secrets.size
			? page
			: {
					...page,
					items: page.items.flatMap((day) => {
						const blocks = day.blocks.flatMap<(typeof day.blocks)[number]>((block) => {
							if (block.type === "entry") return safeEntry(block.entry).map((entry) => ({ type: "entry", entry }));
							const entries = block.stay.entries.flatMap(safeEntry);
							return entries.length ? [{ ...block, stay: { ...block.stay, entries } }] : [];
						});
						if (day.blocks.length && !blocks.length) return [];
						const photos = blocks.reduce(
							(count, block) =>
								count +
								(block.type === "entry"
									? block.entry.mediaCount
									: block.stay.entries.reduce((sum, entry) => sum + entry.mediaCount, 0)),
							0,
						);
						return [{ ...day, blocks, digest: { ...day.digest, photos } }];
					}),
				};
		size += JSON.stringify(clean).length;
		if (size > TIMELINE_SNAPSHOT_LIMIT) break;
		pages.push(clean);
	}
	return { pages, pageParams: data.pageParams.slice(0, pages.length) };
}
