import type { MemoryDay, MemoryEntry } from "@yonder/protocol";
import type { Sky } from "./timeline-sky.tsx";
import type { DayPart, StepKind, TimelineDay, TimelineEvent, TimelineStep } from "./timeline-types.ts";

/** The part of the day a moment falls in, by the device's clock: the same clock that files events into days. */
export function partOf(iso: string): DayPart {
	const hour = new Date(iso).getHours();
	if (hour < 5) return "predawn";
	if (hour < 8) return "dawn";
	if (hour < 11) return "morning";
	if (hour < 13) return "noon";
	if (hour < 17) return "afternoon";
	if (hour < 19) return "dusk";
	if (hour < 23) return "evening";
	return "night";
}

/** Which sky a part of the day sits under. A span takes the sky it starts in. */
export function skyOfPart(part: DayPart): Sky {
	if (part === "dawn") return "dawn";
	if (part === "dusk") return "dusk";
	if (part === "morning" || part === "noon" || part === "afternoon") return "day";
	return "night";
}

const clock = (iso: string) => {
	const date = new Date(iso);
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const stepKind = (entry: MemoryEntry): StepKind => {
	if (entry.media.length || entry.kind === "photo") return "photo";
	if (entry.kind === "voice") return "recording";
	if (entry.kind === "ai") return "thought";
	return "talk";
};

/** What happened inside an entry: its pictures, or the line the organizer kept. A quiet line has no process. */
function stepsOf(entry: MemoryEntry): TimelineStep[] {
	const at = clock(entry.at);
	if (entry.media.length) {
		return [
			{
				at,
				kind: "photo",
				text: entry.text ?? "",
				media: entry.media,
				...(entry.visibility === "secret" ? { secretMedia: true } : {}),
				photoCount: Math.max(entry.media.length, entry.mediaCount),
				...(entry.place ? { photoNote: entry.place } : {}),
			},
		];
	}
	if (entry.size !== "line" && entry.text) return [{ at, kind: stepKind(entry), text: entry.text }];
	return [];
}

function eventOf(entry: MemoryEntry, now: number, place?: string): TimelineEvent {
	const part = partOf(entry.at);
	const endPart = entry.endsAt ? partOf(entry.endsAt) : part;
	return {
		part,
		...(endPart !== part ? { endPart } : {}),
		headline: entry.title,
		steps: stepsOf(entry),
		major: entry.size !== "line",
		...(Date.parse(entry.at) > now ? { upcoming: true } : {}),
		...(place || entry.place ? { place: place ?? entry.place ?? "" } : {}),
		entry,
	};
}

/**
 * The account's days as the page draws them: oldest day first, and inside a day oldest event first,
 * whatever order the server sent. A stay's entries are lifted out, carrying the place they happened in.
 */
export function toTimelineDays(days: MemoryDay[], now: Date): TimelineDay[] {
	const at = now.getTime();
	return days
		.slice()
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
		.map((day) => {
			const items = day.blocks.flatMap((block) =>
				block.type === "entry"
					? [{ entry: block.entry, place: undefined as string | undefined }]
					: block.stay.entries.map((entry) => ({ entry, place: block.stay.place })),
			);
			items.sort((a, b) => Date.parse(a.entry.at) - Date.parse(b.entry.at));
			return {
				date: day.date,
				digestPath: day.digestPath,
				state: day.state,
				failure: day.failure,
				digest: day.digest,
				stays: day.blocks.flatMap((block) =>
					block.type === "stay"
						? [
								{
									id: block.stay.id,
									place: block.stay.place,
									area: block.stay.area,
									startsAt: block.stay.startsAt,
									endsAt: block.stay.endsAt,
								},
							]
						: [],
				),
				events: items.map((item) => eventOf(item.entry, at, item.place)),
			};
		});
}
