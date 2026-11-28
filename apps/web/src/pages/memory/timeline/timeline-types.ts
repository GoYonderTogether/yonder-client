/**
 * The one shape the timeline page draws. The account's days are turned into it by `toTimelineDays`;
 * the dev preview's sample days are written in it directly, so both show the same design.
 *
 * The timeline is a narrator watching one person. A day is a few `events`; each event is one thing
 * that happened to the owner, with its process hanging under it as `steps`. `at` on a step is when
 * that step really happened, never when the review ran. Days run oldest first, like the Photos app.
 */

import type { BrandId, MemoryEntry, MemoryMedia } from "@yonder/protocol";

export type StepKind = "thought" | "talk" | "decision" | "photo" | "message" | "recording";

/** A part of the day, from the clock alone; the page words it in the reader's language. */
export type DayPart = "predawn" | "dawn" | "morning" | "noon" | "afternoon" | "dusk" | "evening" | "night";

/**
 * Where a step came from: a brand in the registry (04 图标登记表) and one quoted line naming it. A
 * step with a source draws that brand's official icon; a step without one keeps the plain drawing
 * the timeline always had, so an older entry reads exactly as before.
 */
export interface TimelineSource {
	brand: BrandId;
	/** One short quoted line, such as 「来自微信」, worded by whoever supplied the source. */
	label: string;
}

export interface TimelineStep {
	at: string;
	kind: StepKind;
	text: string;
	detail?: string;
	/** The connector or channel this step reached the owner through, when it is known. */
	source?: TimelineSource;
	/** Preview only: files under `dev/photos/`. */
	photos?: string[];
	/** The account's own photos and videos. */
	media?: MemoryMedia[];
	/** Secret memory bytes are kept only while the view is open. */
	secretMedia?: true;
	/** How many photos the entry holds in all; the organizer may show only a few of them. */
	photoCount?: number;
	/** Under a photo strip: how many and where, never who is in the picture. */
	photoNote?: string;
	/** A message that reached the owner over a channel; `source` says which one, when it is known. */
	from?: { name: string };
}

/** One thing that happened to the owner. Its `steps` are the process, never separate events. */
export interface TimelineEvent {
	/** Words for a part of the day or a span ("从傍晚到半夜"), when someone chose them. */
	marker?: string;
	/** The part of the day it starts in, and the one it ends in when it spans more than one. */
	part?: DayPart;
	endPart?: DayPart;
	/** One sentence naming the thing. */
	headline: string;
	steps: TimelineStep[];
	/** True for what mattered (a card), false for a quiet line. Unset: decided from the steps. */
	major?: boolean;
	/** Still ahead of now: a planned entry. */
	upcoming?: boolean;
	place?: string;
	/** The account's entry this was made from; it carries the media, sources and delete. */
	entry?: MemoryEntry;
}

export interface TimelineDay {
	date: string;
	weekday?: string;
	/** One sentence for the whole day, second person. */
	lead?: string;
	/** What is still open at the end of the day. */
	open?: string[];
	digestPath?: string | null;
	state?: "ready" | "organizing" | "failed";
	failure?: string | null;
	digest?: { steps: number | null; places: number; photos: number };
	/** Where the owner stayed during the day; the events inside happened there. */
	stays?: { id: string; place: string; area: string | null; startsAt: string; endsAt: string | null }[];
	events: TimelineEvent[];
}
