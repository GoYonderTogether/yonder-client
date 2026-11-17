import type { Attachment } from "../chat/chat.ts";
import type { Timestamp } from "../common/error.ts";

/**
 * The memory timeline. The server records raw events (chat messages, meeting recordings, finished
 * tasks; later device signals and outside group chats), an AI pass organizes each day's events into
 * a few entries and decides how much room each one deserves, and the client only renders them.
 * Dates are the owner's local calendar dates, `YYYY-MM-DD`.
 */

/** What kind of material an entry is mostly about. The client gives each one colour and icon. */
export type MemoryKind = "place" | "photo" | "doc" | "voice" | "chat" | "ai" | "other";

/**
 * How much room an entry takes, chosen by how much it matters:
 * `line` one short sentence and a link; `note` a title, two lines, attachments and tags;
 * `media` a title and a strip of photos or video; `moment` a big occasion with a photo mosaic.
 */
export type MemorySize = "line" | "note" | "media" | "moment";

/** A more specific icon for everyday activity; null uses the kind's icon. */
export type MemoryActivity =
	| "sleep"
	| "walk"
	| "run"
	| "bike"
	| "car"
	| "train"
	| "flight"
	| "food"
	| "coffee"
	| "music"
	| "calendar"
	| "camp"
	| "book"
	| "nature"
	| "water";

/** A photo or video the AI picked for the entry. The bytes come from the attachment endpoint. */
export interface MemoryMedia {
	attachment: Attachment;
	/** Set for video. */
	durationMs: number | null;
}

/** A document, recording, chat, web page or other source an entry cites. */
export interface MemoryMaterial {
	id: string;
	kind: MemoryKind;
	label: string;
	/** One line under the label, such as "32 min, transcribed" or a folder. */
	detail: string | null;
	/** Opens in the in-app reader when set. */
	attachment: Attachment | null;
	/** An `https` page to open when there is no attachment. */
	url: string | null;
}

export interface MemoryPerson {
	name: string;
	avatarUrl: string | null;
}

/** Where tapping a source goes. */
export type MemoryTarget =
	| { type: "conversation"; conversationId: string; messageId: string | null }
	| { type: "schedules" };

/** The raw events an entry was organized from, grouped by where they came from. */
export interface MemorySource {
	kind: "chat" | "meeting" | "task";
	/** The conversation, meeting or task title. */
	title: string;
	/** How many events from this source the entry uses. */
	count: number;
	target: MemoryTarget | null;
}

/** Another entry this one continues or led to. */
export interface MemoryLink {
	date: string;
	entryId: string;
	/** Says how they relate, for example "Led to Monday's plan". */
	label: string;
}

export interface MemoryEntry {
	id: string;
	size: MemorySize;
	kind: MemoryKind;
	activity: MemoryActivity | null;
	at: Timestamp;
	/** Set when the entry lasts, such as an outing. */
	endsAt: Timestamp | null;
	title: string;
	/** The short version: two lines under a `note`, the first lines of the opened view on others. */
	text: string | null;
	/** The organized account, shown in full once the entry is opened. */
	body: string | null;
	/** Where a `moment` took place. */
	place: string | null;
	media: MemoryMedia[];
	/** Photos and videos kept for the entry, including any not sent in `media`. */
	mediaCount: number;
	materials: MemoryMaterial[];
	tags: string[];
	people: MemoryPerson[];
	quote: { text: string; source: string } | null;
	links: MemoryLink[];
	/** What the entry was organized from; empty for planned entries. */
	sources: MemorySource[];
	/** Only the organizer's own entries can be deleted; planned entries come from their plan. */
	deletable: boolean;
}

/** Time spent in one place; the entries inside happened there. */
export interface MemoryStay {
	id: string;
	place: string;
	area: string | null;
	startsAt: Timestamp;
	/** Null while the owner is still there. */
	endsAt: Timestamp | null;
	entries: MemoryEntry[];
}

export type MemoryBlock = { type: "entry"; entry: MemoryEntry } | { type: "stay"; stay: MemoryStay };

export interface MemoryDay {
	date: string;
	/**
	 * `organizing` while new events of the day wait for or are in the AI pass; `failed` when the last
	 * pass failed, with the real reason in `failure`.
	 */
	state: "ready" | "organizing" | "failed";
	failure: string | null;
	digest: { steps: number | null; places: number; photos: number };
	/** In time order, oldest first. Today may include planned entries after now. */
	blocks: MemoryBlock[];
}

/**
 * `GET /v1/memory/days?cursor=&tz=`: days newest first, today included, days with nothing left
 * out. The first page covers about two weeks; pass `nextCursor` for older days. `tz` is the
 * device's IANA time zone; the server files events into calendar days in it.
 */
export interface MemoryDayPage {
	items: MemoryDay[];
	nextCursor: string | null;
}

/** `PATCH /v1/memory/entries/:id`. An edited entry is never rewritten by the organizer again. */
export interface UpdateMemoryRequest {
	title?: string;
	text?: string | null;
	body?: string | null;
}
