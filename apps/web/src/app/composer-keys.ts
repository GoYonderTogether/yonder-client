/**
 * Enter, Shift+Enter and an IME's confirming Enter, decided in one place.
 *
 * Copied from the mature web client opencode `bdf7572` (2026-10-23), which puts the same rules in
 * three spots of its prompt editor:
 *
 * - `packages/app/src/composer/editor/editor.tsx:267-271` — Enter without Shift and without
 *   `isComposing` prevents the newline, ignores a held key, and submits. Shift+Enter is not handled,
 *   so the browser's own newline stands.
 * - `packages/app/src/composer/suggestions/machine.ts:245-250` — with the suggestion popover open,
 *   Enter (not while composing) and Tab select the active item instead of submitting.
 * - `packages/app/src/home/sessions/view.tsx:622-627` — a composition-confirming keydown can arrive
 *   with `isComposing` false but `keyCode 229` on Safari; that key is left to the IME. It also
 *   documents that Enter/Escape during composition commit or cancel the composition, not the action.
 *
 * There is no post-composition time window in the reference client: the confirming key is the only
 * one suppressed, so the next Enter always sends.
 */

export interface ComposerKeyEvent {
	key: string;
	shiftKey: boolean;
	/** `KeyboardEvent.isComposing`, and our own composition-start/end flag, which covers browsers that
	 *  do not set it on every event. */
	isComposing: boolean;
	/** `KeyboardEvent.keyCode`; 229 marks a key an IME is consuming (Safari reports it after `compositionend`). */
	keyCode: number;
	/** A held key must not fire the action repeatedly. */
	repeat: boolean;
	/** Desktop sends on Enter; the phone composer sends only through the button. */
	sendOnEnter: boolean;
	/** The completion popup is open with a selectable item. */
	completionOpen: boolean;
}

export type ComposerKeyAction =
	/** Send the message; the caller prevents the newline. */
	| "send"
	/** Let the browser insert the newline. */
	| "newline"
	/** Select the popup's active item; the caller prevents the newline. */
	| "accept-completion"
	/** A repeated command key: prevent the default and do nothing else. */
	| "consume"
	/** A key the composer does not own (Escape, Tab, arrows, letters): the popup and dictation own it. */
	| "passthrough"
	/** The IME owns the key: leave it entirely alone. */
	| "ignore";

/**
 * The one decision for a keydown in the composer field. `composer.tsx` calls this and nothing else.
 */
export function composerKeyAction(event: ComposerKeyEvent): ComposerKeyAction {
	// The IME owns the key: its Enter commits the candidate, so neither send nor newline applies.
	if (event.isComposing || event.keyCode === 229) return "ignore";
	if (event.key !== "Enter") return "passthrough";
	// Shift+Enter is a newline in every client that sends on Enter; on a phone composer it is either a
	// newline or the same as Enter, and the browser's newline is right in both.
	if (event.shiftKey) return "newline";
	// A phone composer has no Enter-to-send, so Enter inserts the line the browser would insert.
	if (!event.sendOnEnter && !event.completionOpen) return "newline";
	// A held key is one press. A command must not fire twice; a newline repeating is the browser's
	// usual behaviour, so only the command path is consumed.
	if (event.repeat) return "consume";
	if (event.completionOpen) return "accept-completion";
	return "send";
}

/** The event fields and state the keydown handler reads. */
export interface ComposerKeyDown extends Omit<ComposerKeyEvent, "sendOnEnter" | "completionOpen"> {
	preventDefault(): void;
}

/**
 * Apply one keydown: the single place that turns `composerKeyAction` into what the field does. The
 * popup gets every key it does not own, and `interrupt` ends dictation when the caret moves.
 */
export function handleComposerKey(
	event: ComposerKeyDown,
	state: { composing: boolean; sendOnEnter: boolean; completionOpen: boolean },
	actions: {
		acceptCompletion: () => boolean;
		send: () => void;
		interrupt: () => void;
	},
) {
	const action = composerKeyAction({
		key: event.key,
		shiftKey: event.shiftKey,
		// The engine's flag and the composer's own composition record both count: some engines clear
		// `isComposing` before the confirming keydown arrives.
		isComposing: state.composing || event.isComposing,
		keyCode: event.keyCode,
		repeat: event.repeat,
		sendOnEnter: state.sendOnEnter,
		completionOpen: state.completionOpen,
	});
	// A key the IME is using stays entirely with the engine.
	if (action === "ignore") return;
	// Every other key the composer does not own (Escape, Tab, arrows, paging) belongs to the popup;
	// when it declines, dictation's caret has moved and the session ends.
	if (action === "passthrough") {
		if (actions.acceptCompletion()) return;
		actions.interrupt();
		return;
	}
	actions.interrupt();
	// A phone's Enter and Shift+Enter are the browser's own newline.
	if (action === "newline") return;
	event.preventDefault();
	// A held key is one press: neither send nor a second selection.
	if (action === "consume") return;
	// The popup takes Enter to accept its active item. When it declines (the item cannot be taken,
	// e.g. the skill limit) desktop Enter sends as it would without a popup.
	if (action === "accept-completion" && (actions.acceptCompletion() || !state.sendOnEnter)) return;
	actions.send();
}
