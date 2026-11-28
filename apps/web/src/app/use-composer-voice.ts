import type { RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { TextEditRange } from "./completion/bindings.ts";
import { useVoiceInput } from "./use-voice-input.ts";

/** The span the current dictation revises; `text` is what the engine has produced so far. */
interface VoiceSession {
	start: number;
	end: number;
	text: string;
	expectedStart: number;
	expectedEnd: number;
}

export interface ComposerVoiceOptions {
	/** A draft belongs to one conversation; a new scope ends any session in progress. */
	scope: string;
	draft: string;
	onDraftChange: (value: string, edit?: TextEditRange) => void;
	onSend: () => void;
	/** The editor whose selection dictation replaces. */
	editor: RefObject<HTMLTextAreaElement | null>;
	sending: boolean;
	disabled: boolean;
	disconnected: boolean;
	streaming: boolean;
	canSend: boolean;
	hasFiles: boolean;
	microphoneOccupied: boolean;
	onActivityChange?: ((active: boolean) => void) | undefined;
}

/**
 * Dictation inside the composer: the live session, its insertion span, and the wait that lets a
 * spoken sentence finish before the message leaves. Editing, a caret move or a new scope interrupts
 * the session, and a send that is waiting for the engine keeps the text the user can see.
 */
export function useComposerVoice({
	scope,
	draft,
	onDraftChange,
	onSend,
	editor,
	sending,
	disabled,
	disconnected,
	streaming,
	canSend,
	hasFiles,
	microphoneOccupied,
	onActivityChange,
}: ComposerVoiceOptions) {
	const [active, setActive] = useState(false);
	const voice = useVoiceInput(scope);
	useLayoutEffect(() => {
		onActivityChange?.(voice.isListening);
	}, [voice.isListening, onActivityChange]);
	useLayoutEffect(() => () => onActivityChange?.(false), [onActivityChange]);
	const session = useRef<VoiceSession | null>(null);
	const pending = useRef(0);
	const waitingToSend = useRef(false);
	const latestDraft = useRef(draft);
	const latestSend = useRef(onSend);
	latestDraft.current = draft;
	latestSend.current = onSend;
	const voiceRef = useRef(voice);
	voiceRef.current = voice;
	// Scope changes must invalidate a session before the new editor is interactive.
	// biome-ignore lint/correctness/useExhaustiveDependencies: scope owns this cleanup.
	useLayoutEffect(
		() => () => {
			pending.current++;
			waitingToSend.current = false;
			session.current = null;
			setActive(false);
			voiceRef.current.cancel();
		},
		[scope],
	);
	function interrupt() {
		pending.current++;
		waitingToSend.current = false;
		if (session.current) {
			session.current = null;
			setActive(false);
			voice.cancel();
		}
	}
	function startVoice() {
		if (microphoneOccupied) return;
		const target = editor.current;
		if (!target) return;
		interrupt();
		const start = target.selectionStart;
		const end = target.selectionEnd;
		const current = { start, end, text: "", expectedStart: start, expectedEnd: end };
		session.current = current;
		setActive(true);
		void voice.start((text) => {
			if (session.current !== current || (!text && !current.text)) return;
			const value = latestDraft.current;
			const next = value.slice(0, current.start) + text + value.slice(current.end);
			const edit = { start: current.start, end: current.end };
			current.end = current.start + text.length;
			current.text = text;
			current.expectedStart = current.expectedEnd = current.end;
			latestDraft.current = next;
			// Restore the caret before the browser reports the controlled value's selection change.
			flushSync(() => onDraftChange(next, edit));
			if (session.current === current) editor.current?.setSelectionRange(current.end, current.end);
		});
	}
	function pauseVoice() {
		const current = session.current;
		const token = pending.current;
		void voice.finish().finally(() => {
			if (session.current === current && pending.current === token) {
				session.current = null;
				setActive(false);
			}
		});
	}
	function send() {
		if (sending || waitingToSend.current || disabled || disconnected || streaming || (!canSend && !session.current))
			return;
		const current = session.current;
		if (!current) {
			onSend();
			editor.current?.focus({ preventScroll: true });
			return;
		}
		const token = ++pending.current;
		waitingToSend.current = true;
		let timer: ReturnType<typeof setTimeout>;
		const deadline = new Promise<void>((resolve) => {
			timer = setTimeout(resolve, 2000);
		});
		void Promise.race([voice.finish(), deadline]).then(() => {
			clearTimeout(timer);
			if (pending.current !== token || session.current !== current) return;
			waitingToSend.current = false;
			session.current = null;
			setActive(false);
			voice.cancel();
			if (latestDraft.current.trim() || hasFiles) latestSend.current();
			editor.current?.focus({ preventScroll: true });
		});
	}
	/** True when the caret left the span dictation owns, which means the user took over. */
	function selectionMoved(target: HTMLTextAreaElement): boolean {
		const current = session.current;
		return (
			current !== null &&
			(target.selectionStart !== current.expectedStart || target.selectionEnd !== current.expectedEnd)
		);
	}
	return { voice, active, interrupt, startVoice, pauseVoice, send, latestDraft, selectionMoved };
}
