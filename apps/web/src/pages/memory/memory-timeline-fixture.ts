import type { Attachment, MemoryDay, MemoryEntry } from "@yonder/protocol";

/** The timeline fixtures: three days with every entry size, a stay and real-looking sources. */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();
const photo = (id: string): Attachment => ({ id, kind: "image", name: `${id}.jpg`, mimeType: "image/jpeg", size: 1 });
export const entry = (
	id: string,
	size: MemoryEntry["size"],
	title: string,
	rest: Partial<MemoryEntry> = {},
): MemoryEntry => ({
	id,
	size,
	kind: "other",
	activity: null,
	at: at(16, 9),
	endsAt: null,
	title,
	text: null,
	body: null,
	place: null,
	media: [],
	mediaCount: 0,
	materials: [],
	tags: [],
	people: [],
	quote: null,
	links: [],
	visibility: "private",
	weight: 1,
	sources: [],
	deletable: true,
	...rest,
});
export const day = (date: string, blocks: MemoryDay["blocks"], rest: Partial<MemoryDay> = {}): MemoryDay => ({
	date,
	state: "ready",
	failure: null,
	digest: { steps: null, places: 0, photos: 0 },
	digestPath: null,
	blocks,
	...rest,
});
export const today: MemoryDay = day(
	"2026-11-16",
	[
		{
			type: "entry",
			entry: entry("wake", "line", "Woke up after 7 hours", {
				activity: "sleep",
				at: at(16, 7, 12),
				// A planned entry belongs to its plan, so it has nothing behind it and no delete.
				deletable: false,
			}),
		},
		{
			type: "stay",
			stay: {
				id: "office",
				place: "Office",
				area: "Wensan Road",
				startsAt: at(16, 9, 2),
				endsAt: null,
				entries: [
					entry("plan", "note", "Rewrote the timeline plan", {
						kind: "doc",
						at: at(16, 9, 30),
						text: "Four sizes by how much a thing matters.",
						body: "Four sizes by how much a thing matters, from a single line to a photo mosaic.",
						materials: [
							{ id: "m1", kind: "doc", label: "timeline-v4.md", detail: "Saved 15:12", attachment: null, url: null },
						],
						tags: ["Yonder"],
						links: [{ date: "2026-11-08", entryId: "followups", label: "Picked up from Wednesday" }],
						sources: [
							{
								kind: "chat",
								title: "Yonder Bot",
								count: 12,
								target: { type: "conversation", conversationId: "c-primary", messageId: null },
							},
							{ kind: "meeting", title: "Weekly review", count: 1, target: null },
							{ kind: "task", title: "", count: 2, target: { type: "schedules" } },
						],
					}),
				],
			},
		},
		{
			type: "entry",
			entry: entry("reading", "line", "Book club at the bookstore", { activity: "calendar", at: at(16, 19, 30) }),
		},
	],
	{ digest: { steps: 6180, places: 2, photos: 9 } },
);
export const yesterday: MemoryDay = day(
	"2026-11-15",
	[
		{
			type: "entry",
			entry: entry("market", "moment", "Went to the indie makers' market", {
				kind: "place",
				activity: "camp",
				at: at(15, 13, 30),
				endsAt: at(15, 18, 10),
				place: "Liangzhu Arts Centre",
				media: [{ attachment: photo("p1"), durationMs: null }],
				mediaCount: 23,
				people: [{ name: "Zhou", avatarUrl: null }],
				text: "Demoed Yonder nine times.",
			}),
		},
	],
	{ digest: { steps: null, places: 3, photos: 31 } },
);
export const older: MemoryDay = day(
	"2026-11-08",
	[
		{ type: "entry", entry: entry("train", "line", "Fixed the demo on the train", { at: at(8, 19, 30) }) },
		{
			type: "entry",
			entry: entry("followups", "note", "AI turned both meetings into a follow-up list", {
				kind: "ai",
				at: at(8, 22),
				text: "Six to-dos.",
				sources: [{ kind: "meeting", title: "Two recordings", count: 2, target: null }],
			}),
		},
	],
	{ digest: { steps: 16880, places: 1, photos: 27 } },
);
