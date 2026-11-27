/**
 * The shape of a preview day, and the methodology it carries.
 *
 * The timeline is a narrator watching one person. A day is a few `events`; each event is one thing
 * that happened to the owner, with its process hanging under it as `steps`. Two chats forty minutes
 * apart about the same subject are one event with two steps. Nothing the Bot did for itself, and
 * nothing the owner would not want to read back in a year, reaches `events`.
 *
 * `marker` groups rather than timestamps: a part of the day ("上午"), or a span ("从傍晚到半夜").
 * `at` on a step is when that step really happened, never when the review ran.
 */

export type StepKind = "thought" | "talk" | "decision" | "photo" | "message" | "recording";

export interface PreviewStep {
	at: string;
	kind: StepKind;
	text: string;
	detail?: string;
	/** Files under `./photos/`. */
	photos?: string[];
	/** Under a photo strip: how many and where, never who is in the picture. */
	photoNote?: string;
	/** A message that reached the owner over WeChat. */
	from?: { name: string };
}

/** One thing that happened to the owner. Its `steps` are the process, never separate events. */
export interface PreviewEvent {
	/** A part of the day or a span of parts. */
	marker: string;
	/** One sentence naming the thing. */
	headline: string;
	steps: PreviewStep[];
}

export interface PreviewDay {
	date: string;
	weekday: string;
	/** One sentence for the whole day, second person. */
	lead: string;
	/** What is still open at the end of the day. */
	open?: string[];
	events: PreviewEvent[];
}
