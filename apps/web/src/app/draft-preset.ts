/**
 * The plus button's preset sentence (16-3 事项与 Bot 分工 第十节, rules C11/C12): it fills the main
 * Bot's chat draft and never sends. Two rules, both here so a page cannot bend them:
 *
 *   1. Fill the draft only. Nothing is submitted.
 *   2. A draft with text or attachments is left exactly as it is.
 *
 * The chat's draft is usually already open in memory when the plus button is pressed, so a phrase
 * is handed to the composer that owns it rather than written behind its back: the composer applies
 * it through its own edit path, which keeps the caret, the revision counter and persistence in step.
 */
import { updateChatCache } from "@yonder/ui-data";

/** The draft record the composer keeps; only these fields a preset touches. */
export interface PresetDraft {
	text: string;
	files: unknown[];
	revision: number;
	clientNonce?: string | undefined;
	bindings?: unknown[] | undefined;
}

/** A draft is only filled when it has neither text nor attachments. */
export function mayFillDraft(text: string | undefined, attachments = 0): boolean {
	return !attachments && (text ?? "").trim() === "";
}

/**
 * The draft after a preset. The revision bump is what the composer's own edits do, so a send that
 * was already in flight cannot clear the sentence the user is looking at.
 */
export function withPreset(current: PresetDraft | undefined, phrase: string): PresetDraft {
	return {
		...(current ?? { files: [], revision: 0 }),
		text: phrase,
		revision: (current?.revision ?? 0) + 1,
		clientNonce: undefined,
	};
}

/** The composer's storage key: one draft per account and conversation. */
export function draftKey(owner: string, conversation: string): string {
	return `draft:${owner}:${conversation}`;
}

/**
 * What an open composer did with the phrase: it took it, the user's own words kept it out, or its
 * draft is still loading and it should be handed the phrase when that finishes.
 */
export type PresetOutcome = "applied" | "refused" | "not-ready";
export type PresetTarget = (phrase: string) => PresetOutcome;

const targets = new Map<string, PresetTarget>();
/** Phrases aimed at a chat whose composer has not registered yet. */
const pending = new Map<string, string>();

/** Register the open composer for one draft key; returns the function that removes it again. */
export function registerPresetTarget(key: string, apply: PresetTarget): () => void {
	targets.set(key, apply);
	const waiting = pending.get(key);
	if (waiting !== undefined && apply(waiting) !== "not-ready") pending.delete(key);
	return () => {
		if (targets.get(key) === apply) targets.delete(key);
	};
}

/**
 * Aim a preset at the main Bot's chat. An open composer takes it at once; one still loading its
 * draft gets it then. A draft that already has text refuses it, and the user's words win.
 */
export function requestPreset(owner: string, conversation: string, phrase: string): void {
	const key = draftKey(owner, conversation);
	const outcome = targets.get(key)?.(phrase);
	if (outcome === "applied" || outcome === "refused") return;
	pending.set(key, phrase);
	// Best effort for a reload between the two: the composer is still the authority.
	void updateChatCache<PresetDraft>(key, (current) =>
		mayFillDraft(current?.text, current?.files.length) ? withPreset(current, phrase) : (current as PresetDraft),
	).catch(() => {});
}

/**
 * The phrase this draft should receive, if one is waiting and the draft is still empty; the entry is
 * consumed either way, so a preset applies once and a typed draft never loses its text.
 */
export function takePreset(key: string, current: PresetDraft | undefined): string | undefined {
	const phrase = pending.get(key);
	if (phrase === undefined) return undefined;
	pending.delete(key);
	return mayFillDraft(current?.text, current?.files.length) ? phrase : undefined;
}
