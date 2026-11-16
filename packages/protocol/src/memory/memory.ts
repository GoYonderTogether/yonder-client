import type { Timestamp } from "../common/error.ts";

/**
 * The memory timeline. The server turns raw device signals (unlocks, steps, location, photos,
 * recordings, file changes, network reconnects) into a few rows per day; the client only renders
 * them. Dates are the owner's local calendar dates, `YYYY-MM-DD`; months are `YYYY-MM`.
 */
export type MemoryRefType = "file" | "place" | "web" | "chat" | "recording" | "photo" | "calendar" | "device";

/** A source a row cites. The same file or place keeps the same id on every day it appears. */
export interface MemoryRef {
	id: string;
	type: MemoryRefType;
	label: string;
	/** Where it lives or what it is, for example a folder path or a meeting's time range. */
	detail: string | null;
	/** A short excerpt, such as a line from a recording or a chat. */
	quote: string | null;
	/** For `device` refs: how raw signals were merged, one sentence each. */
	notes: string[];
}

export type MemoryEventKind = "work" | "meeting" | "voice" | "chat" | "read" | "photo" | "trip";

export type MemoryRow =
	| {
			id: string;
			type: "place";
			startsAt: Timestamp;
			/** Null while the owner is still there. */
			endsAt: Timestamp | null;
			ref: string;
			note: string | null;
	  }
	| { id: string; type: "move"; startsAt: Timestamp; endsAt: Timestamp }
	| {
			id: string;
			type: "event";
			at: Timestamp;
			kind: MemoryEventKind;
			title: string;
			detail: string | null;
			weight: "normal" | "key";
			refs: string[];
	  };

export interface MemoryDay {
	date: string;
	/** One sentence naming what set the day apart, most notable first. */
	lede: string | null;
	rows: MemoryRow[];
	/** Every ref the rows cite, once. */
	refs: MemoryRef[];
	/** Raw records that were merged into these rows, and the `device` ref explaining how. */
	merged: { count: number; ref: string | null };
}

/**
 * `GET /v1/memory/days` returns every day of this month and last month; `?month=YYYY-MM` returns one
 * older month. Newest first, today included, days without rows left out.
 */
export interface MemoryDayList {
	items: MemoryDay[];
}

export interface MemoryMonth {
	month: string;
	note: string | null;
	/** The files and places cited most often that month. */
	refs: MemoryRef[];
	highlights: { date: string; lede: string }[];
	dayCount: number;
}

/** `GET /v1/memory/months`, newest first. */
export interface MemoryMonthList {
	items: MemoryMonth[];
}

export interface MemoryRefUse {
	date: string;
	rowId: string;
	at: Timestamp;
	text: string;
}

/** `GET /v1/memory/refs/:id`: the ref and every row that cites it, newest first. */
export interface MemoryRefDetail {
	ref: MemoryRef;
	uses: MemoryRefUse[];
}
