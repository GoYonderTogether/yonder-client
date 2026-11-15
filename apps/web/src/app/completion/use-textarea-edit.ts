import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { type TextEditRange, textareaEditRange } from "./bindings.ts";

/** Capture native transactions before the browser changes the controlled textarea value. */
export function useTextareaEdit(input: RefObject<HTMLTextAreaElement | null>, scope: string) {
	const pending = useRef<{ text: string; scope: string; range: TextEditRange; type: string } | null>(null);
	useEffect(() => {
		pending.current = null;
		const editor = input.current;
		if (!editor) return;
		const record = (event: InputEvent) => {
			pending.current = {
				scope,
				text: editor.value,
				range: { start: editor.selectionStart, end: editor.selectionEnd },
				type: event.inputType,
			};
		};
		editor.addEventListener("beforeinput", record);
		return () => editor.removeEventListener("beforeinput", record);
	}, [input, scope]);
	return (before: string, after: string) => {
		const transaction = pending.current;
		pending.current = null;
		return transaction?.scope === scope && transaction.text === before
			? textareaEditRange(before, after, transaction.range, transaction.type)
			: undefined;
	};
}
