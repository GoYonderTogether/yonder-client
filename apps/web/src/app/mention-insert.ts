import type { useChatDraft } from "./use-chat-draft.ts";

/**
 * Put `@name ` in the composer for somebody in the conversation, through the draft's own completion
 * bindings, so `mentionedMemberIds` carries that member when the message is sent. This is the same
 * path the @ picker takes (`acceptCompletion`), not a second way of writing the text: the marker is
 * recorded with its range, and the range survives later edits the way every accepted mention does.
 *
 * Focus and the caret are moved on the field itself. The composer owns the field; nothing here reads
 * its value, and the draft stays the single source of the text.
 */
export function insertMention(draft: ReturnType<typeof useChatDraft>, memberId: string, displayName: string): boolean {
	if (!draft.loaded) return false;
	const before = draft.text;
	const marker = `@${displayName}`;
	// The binding only holds between whitespace, so a mention typed onto the end of a word starts a word.
	const lead = before === "" || /\s$/u.test(before) ? "" : " ";
	const at = before.length;
	const text = `${before}${lead}${marker} `;
	draft.acceptCompletion(
		text,
		{ id: memberId, kind: "member", marker, start: at + lead.length, end: at + lead.length + marker.length },
		{ start: at, end: at },
	);
	placeCaretAtEnd(text);
	return true;
}

/** The composer's field is the one textarea it renders; a frame without one simply skips this. */
const FIELD = "textarea.composer-text";

function placeCaretAtEnd(text: string) {
	if (typeof document === "undefined") return;
	// The draft is controlled, so the field's new value arrives with the next frame; the caret is
	// placed only if the field still ends where the mention left it, never over a later edit.
	requestAnimationFrame(() => {
		const field = document.querySelector<HTMLTextAreaElement>(FIELD);
		if (!field || field.value !== text) return;
		field.focus({ preventScroll: true });
		field.setSelectionRange(text.length, text.length);
	});
}
