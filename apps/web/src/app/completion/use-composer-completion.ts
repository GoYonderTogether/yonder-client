import type { KeyboardEvent, RefObject } from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { CompletionMarker, TextEditRange } from "./bindings.ts";
import {
	COMPLETION_PAGE_SIZE,
	type CompletionItem,
	type CompletionToken,
	completionToken,
	filterCompletions,
	navigateCompletion,
} from "./tokens.ts";

export function useComposerCompletion({
	input,
	text,
	scope,
	items,
	selectedIds,
	blocked,
	onAccept,
	onCommand,
}: {
	input: RefObject<HTMLTextAreaElement | null>;
	text: string;
	scope: string;
	items: readonly CompletionItem[];
	selectedIds: readonly string[];
	blocked: boolean;
	onAccept?: ((text: string, marker: CompletionMarker, edit: TextEditRange) => void) | undefined;
	onCommand?: ((text: string, edit: TextEditRange) => void) | undefined;
}) {
	const id = useId();
	const popup = useRef<HTMLDivElement>(null);
	const inserting = useRef(false);
	const dismissed = useRef("");
	const dismissedText = useRef("");
	const [state, setState] = useState<{ token: CompletionToken; scope: string; active: number } | null>(null);
	const token = !blocked && state?.scope === scope && state.token.text === text ? state.token : null;
	const matches = token ? filterCompletions(items, token.query, token.prefix) : [];
	const active = Math.min(state?.active ?? 0, Math.max(0, matches.length - 1));
	const page = Math.floor(active / COMPLETION_PAGE_SIZE);
	const signature = (next: CompletionToken) => `${scope}:${next.start}:${next.prefix}:${next.query}`;
	function close() {
		if (token) {
			dismissed.current = signature(token);
			dismissedText.current = token.text;
		}
		setState(null);
	}
	function sync(editor: HTMLTextAreaElement, composing = false) {
		if (editor.value !== dismissedText.current) dismissed.current = "";
		const next =
			composing || blocked ? null : completionToken(editor.value, editor.selectionStart, editor.selectionEnd);
		if (!next || dismissed.current === signature(next)) {
			setState(null);
			return;
		}
		setState((previous) => ({
			token: next,
			scope,
			active: previous?.scope === scope && signature(previous.token) === signature(next) ? previous.active : 0,
		}));
	}
	function canAccept(item: CompletionItem) {
		return item.kind !== "skill" || selectedIds.includes(item.id) || selectedIds.length < 5;
	}
	function accept(item: CompletionItem) {
		if (!token || !onAccept || !canAccept(item)) return false;
		if (item.kind === "command") {
			onCommand?.(text.slice(0, token.start) + text.slice(token.end), { start: token.start, end: token.end });
			close();
			return true;
		}
		const marker = token.prefix + item.name;
		const space = /\s/u.test(text[token.end] ?? "") ? "" : " ";
		const next = text.slice(0, token.start) + marker + space + text.slice(token.end);
		const editor = input.current;
		if (editor && typeof document.execCommand === "function") {
			editor.focus({ preventScroll: true });
			editor.setSelectionRange(token.start, token.end);
			inserting.current = true;
			try {
				// Native insertion preserves textarea undo/redo, selection and IME editing semantics.
				document.execCommand("insertText", false, marker + space);
			} finally {
				inserting.current = false;
			}
		}
		onAccept(
			next,
			{ id: item.id, kind: item.kind, marker, start: token.start, end: token.start + marker.length },
			{ start: token.start, end: token.end },
		);
		close();
		requestAnimationFrame(() => {
			input.current?.focus({ preventScroll: true });
			input.current?.setSelectionRange(
				token.start + marker.length + space.length,
				token.start + marker.length + space.length,
			);
		});
		return true;
	}
	function keyDown(event: KeyboardEvent<HTMLTextAreaElement>, composing: boolean) {
		if (!token || composing || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return false;
		if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
		if (event.key === "Escape") {
			close();
			event.preventDefault();
			event.stopPropagation();
			return true;
		}
		if (event.key === "Tab") {
			if (event.shiftKey) return false;
			const item = matches[active];
			if (!item || !accept(item)) return false;
			event.preventDefault();
			return true;
		}
		const index = navigateCompletion(event.key, active, matches.length);
		if (index === null) return false;
		event.preventDefault();
		setState((current) => current && { ...current, active: index });
		return true;
	}
	useEffect(() => {
		if (!token) return;
		const outside = (event: PointerEvent) => {
			if (event.target !== input.current && !popup.current?.contains(event.target as Node)) close();
		};
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	});
	return {
		suspend: () => setState(null),
		id,
		popup,
		inserting,
		token,
		matches,
		active,
		page,
		accept,
		canAccept,
		close,
		sync,
		keyDown,
		setPage: (direction: number) => {
			const index = navigateCompletion(direction > 0 ? "PageDown" : "PageUp", active, matches.length);
			if (index !== null) setState((current) => current && { ...current, active: index });
		},
	};
}
