import type { useChatDraft } from "../use-chat-draft.ts";

/** Append a menu-selected member using the same binding as the composer's completion picker. */
export function mentionInDraft(
	draft: Pick<ReturnType<typeof useChatDraft>, "text" | "acceptCompletion">,
	id: string,
	name: string,
) {
	const marker = `@${name}`;
	const before = draft.text;
	const lead = before && !/\s$/u.test(before) ? " " : "";
	const at = before.length;
	const start = at + lead.length;
	const text = `${before}${lead}${marker} `;
	draft.acceptCompletion(
		text,
		{ id, kind: "member", marker, start, end: start + marker.length },
		{ start: at, end: at },
	);

	const field = document.querySelector<HTMLTextAreaElement>("textarea.composer-text");
	if (field) {
		field.focus({ preventScroll: true });
		requestAnimationFrame(() => {
			if (document.activeElement === field && field.value === text) field.setSelectionRange(text.length, text.length);
		});
	}
}
