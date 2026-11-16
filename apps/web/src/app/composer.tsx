import { ComposerFrame, ComposerLayout } from "@yonder/chat-presentation";
import { ArrowUp, FileText, Image, Plus, Square } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CompletionBinding, CompletionMarker, TextEditRange } from "./completion/bindings.ts";
import { CompletionPopup } from "./completion/completion-popup.tsx";
import { SkillHighlight } from "./completion/highlight.tsx";
import type { CompletionItem } from "./completion/tokens.ts";
import { useComposerCompletion } from "./completion/use-composer-completion.ts";
import { useTextareaEdit } from "./completion/use-textarea-edit.ts";
import { ComposerFiles } from "./composer-files.tsx";
import { isFileDrag } from "./file-drop-zone.tsx";
import type { DraftFile } from "./use-chat-draft.ts";
import { useVoiceInput } from "./use-voice-input.ts";
import { VoiceControl } from "./voice-control.tsx";
import "./composer.css";

export interface ComposerProps {
	/** Who the message would go to; the placeholder names them. */
	recipientName: string | null;
	/** The draft lives in the frame, so it survives the composer leaving the screen (「我」, a resize). */
	draft: string;
	onDraftChange: (value: string, edit?: TextEditRange) => void;
	onSend: () => void;
	onStop: () => void;
	streaming: boolean;
	/** A send (upload included) is in flight; the button becomes a working cancel. */
	sending?: boolean;
	onCancelSend?: () => void;
	disabled: boolean;
	disconnected: boolean;
	sendOnEnter: boolean;
	completionItems?: readonly CompletionItem[];
	selectedSkillIds?: readonly string[];
	bindings?: readonly CompletionBinding[];
	onAcceptCompletion?: (text: string, marker: CompletionMarker, edit: TextEditRange) => void;
	onCompact?: () => void;
	commandStatus?: ReactNode;
	files?: DraftFile[];
	onFiles?: (files: File[]) => void;
	onRemoveFile?: (id: string) => void;
	onRetryFile?: (id: string) => void;
	onOriginalFileChange?: (id: string, original: boolean) => void;
	mobilePicker?: boolean;
	scope?: string;
	error?: string;
	readOnly?: boolean;
	microphoneOccupied?: boolean;
	onVoiceActivityChange?: (active: boolean) => void;
}

/**
 * The one composer (11 第七节第 3 条). It is mounted once by the frame and stays mounted across tabs,
 * so what was typed survives a tab switch.
 */
export function Composer({
	recipientName,
	draft,
	onDraftChange: setDraft,
	onSend,
	onStop,
	streaming,
	sending = false,
	onCancelSend,
	disabled,
	disconnected,
	sendOnEnter,
	completionItems = [],
	selectedSkillIds = [],
	bindings = [],
	onAcceptCompletion,
	onCompact,
	commandStatus,
	files = [],
	onFiles,
	onRemoveFile,
	onRetryFile,
	onOriginalFileChange,
	mobilePicker = false,
	scope = "composer",
	error,
	readOnly = false,
	microphoneOccupied = false,
	onVoiceActivityChange,
}: ComposerProps) {
	const { t } = useTranslation();
	const input = useRef<HTMLTextAreaElement>(null);
	const highlight = useRef<HTMLDivElement>(null);
	const picker = useRef<HTMLInputElement>(null);
	const imagePicker = useRef<HTMLInputElement>(null);
	const [menu, setMenu] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const [dragging, setDragging] = useState(false);
	const [voiceActive, setVoiceActive] = useState(false);
	const dragDepth = useRef(0);
	const voice = useVoiceInput(scope);
	useLayoutEffect(() => {
		onVoiceActivityChange?.(voice.isListening);
	}, [voice.isListening, onVoiceActivityChange]);
	useLayoutEffect(() => () => onVoiceActivityChange?.(false), [onVoiceActivityChange]);
	const session = useRef<{
		start: number;
		end: number;
		text: string;
		expectedStart: number;
		expectedEnd: number;
	} | null>(null);
	const pending = useRef(0);
	const waitingToSend = useRef(false);
	const latestDraft = useRef(draft);
	const latestSend = useRef(onSend);
	latestDraft.current = draft;
	latestSend.current = onSend;
	useLayoutEffect(() => {
		const editor = input.current;
		const mirror = highlight.current;
		if (!editor || !mirror) return;
		const sync = () => {
			mirror.style.width = `${editor.clientWidth}px`;
			mirror.scrollTop = editor.scrollTop;
		};
		sync();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(sync);
		observer.observe(editor);
		return () => observer.disconnect();
	}, []);
	const voiceRef = useRef(voice);
	voiceRef.current = voice;
	// Scope changes must invalidate a session before the new editor is interactive.
	// biome-ignore lint/correctness/useExhaustiveDependencies: scope owns this cleanup.
	useLayoutEffect(
		() => () => {
			pending.current++;
			waitingToSend.current = false;
			session.current = null;
			setVoiceActive(false);
			voiceRef.current.cancel();
		},
		[scope],
	);
	const composing = useRef(false);
	const compositionEndedAt = useRef(Number.NEGATIVE_INFINITY);
	const consumeEdit = useTextareaEdit(input, scope);
	const completion = useComposerCompletion({
		input,
		text: draft,
		scope,
		items: completionItems,
		selectedIds: selectedSkillIds,
		blocked: disabled || readOnly || streaming,
		onAccept: (text, marker, edit) => {
			interrupt();
			onAcceptCompletion?.(text, marker, edit);
		},
		onCommand: (text, edit) => {
			interrupt();
			setDraft(text, edit);
			onCompact?.();
		},
	});
	const placeholder = recipientName ? t("chat.composerTo", { name: recipientName }) : t("chat.composerPlaceholder");
	const canSend = !disabled && !disconnected && !streaming && Boolean(draft.trim() || files.length);
	useLayoutEffect(() => {
		const editor = input.current;
		if (!draft && !files.length) {
			setExpanded(false);
			return;
		}
		if (!editor) return;
		const check = () => {
			const height = Number.parseFloat(getComputedStyle(editor).getPropertyValue("--composer-button-size"));
			if (editor.clientHeight > height * 1.4) setExpanded(true);
		};
		check();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(check);
		observer.observe(editor);
		return () => observer.disconnect();
	}, [draft, files.length]);
	function interrupt() {
		pending.current++;
		waitingToSend.current = false;
		if (session.current) {
			session.current = null;
			setVoiceActive(false);
			voice.cancel();
		}
	}
	function startVoice() {
		if (microphoneOccupied) return;
		const editor = input.current;
		if (!editor) return;
		interrupt();
		const start = editor.selectionStart;
		const end = editor.selectionEnd;
		const active = { start, end, text: "", expectedStart: start, expectedEnd: end };
		session.current = active;
		setVoiceActive(true);
		void voice.start((text) => {
			if (session.current !== active || (!text && !active.text)) return;
			const value = latestDraft.current;
			const next = value.slice(0, active.start) + text + value.slice(active.end);
			const edit = { start: active.start, end: active.end };
			active.end = active.start + text.length;
			active.text = text;
			active.expectedStart = active.expectedEnd = active.end;
			latestDraft.current = next;
			setDraft(next, edit);
			// React may commit later; preserve the insertion point after the controlled value updates.
			requestAnimationFrame(() => {
				if (session.current === active && input.current) input.current.setSelectionRange(active.end, active.end);
			});
		});
	}
	function pauseVoice() {
		const active = session.current;
		const token = pending.current;
		void voice.finish().finally(() => {
			if (session.current === active && pending.current === token) {
				session.current = null;
				setVoiceActive(false);
			}
		});
	}
	function send() {
		if (sending || waitingToSend.current || disabled || disconnected || streaming || (!canSend && !session.current))
			return;
		const active = session.current;
		if (!active) {
			onSend();
			input.current?.focus({ preventScroll: true });
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
			if (pending.current !== token || session.current !== active) return;
			waitingToSend.current = false;
			session.current = null;
			setVoiceActive(false);
			voice.cancel();
			if (latestDraft.current.trim() || files.length) latestSend.current();
			input.current?.focus({ preventScroll: true });
		});
	}

	return (
		<div className="relative flex flex-col gap-[var(--spacing-2)]">
			{error || voice.error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{t(error || voice.error)}
				</p>
			) : null}
			{disconnected ? (
				<p role="status" className="text-caption text-[var(--color-text-secondary)]">
					{t(streaming ? "chat.reconnectingReply" : "chat.reconnecting")}
				</p>
			) : null}
			<fieldset
				aria-label={t("chat.attach")}
				onDragEnter={(event) => {
					if (isFileDrag(event) && !disabled) {
						event.preventDefault();
						dragDepth.current++;
						setDragging(true);
					}
				}}
				onDragLeave={(event) => {
					if (isFileDrag(event)) {
						dragDepth.current = Math.max(0, dragDepth.current - 1);
						if (!dragDepth.current) setDragging(false);
					}
				}}
				onDragOver={(event) => {
					if (isFileDrag(event)) event.preventDefault();
				}}
				onDrop={(event) => {
					if (!isFileDrag(event)) return;
					event.preventDefault();
					dragDepth.current = 0;
					setDragging(false);
					if (!disabled) {
						interrupt();
						onFiles?.([...event.dataTransfer.files]);
					}
				}}
			>
				<ComposerFrame as="div" dragging={dragging}>
					<CompletionPopup completion={completion} />
					{files.length ? (
						<ComposerFiles
							files={files}
							disabled={disabled}
							onRemove={(id) => {
								interrupt();
								onRemoveFile?.(id);
							}}
							onRetry={(id) => onRetryFile?.(id)}
							onOriginalChange={(id, original) => {
								interrupt();
								onOriginalFileChange?.(id, original);
							}}
						/>
					) : null}
					{dragging ? (
						<div className="composer-drop-hint" role="status">
							<Plus size={24} aria-hidden="true" />
							{t("chat.dropFiles")}
						</div>
					) : null}
					<ComposerLayout as="div" expanded={Boolean(expanded || draft.includes("\n") || files.length)}>
						<div className="composer-add">
							<button
								type="button"
								className="composer-tool"
								disabled={disabled}
								aria-label={t("chat.attach")}
								aria-expanded={mobilePicker ? menu : undefined}
								onClick={() => (mobilePicker ? setMenu(!menu) : picker.current?.click())}
							>
								<Plus size={21} aria-hidden="true" />
							</button>
							{menu ? (
								<fieldset
									className="composer-add-menu"
									aria-label={t("chat.attach")}
									onKeyDown={(event) => {
										if (event.key === "Escape") setMenu(false);
									}}
								>
									<button
										type="button"
										onClick={() => {
											imagePicker.current?.click();
											setMenu(false);
										}}
									>
										<Image size={18} aria-hidden="true" />
										{t("chat.uploadImages")}
									</button>
									<button
										type="button"
										onClick={() => {
											picker.current?.click();
											setMenu(false);
										}}
									>
										<FileText size={18} aria-hidden="true" />
										{t("chat.uploadFiles")}
									</button>
								</fieldset>
							) : null}
						</div>
						<input
							ref={picker}
							type="file"
							multiple
							className="hidden"
							aria-label={t("chat.uploadFiles")}
							onChange={(event) => {
								interrupt();
								onFiles?.([...(event.target.files ?? [])]);
								event.target.value = "";
							}}
						/>
						<input
							ref={imagePicker}
							type="file"
							accept="image/*"
							multiple
							className="hidden"
							aria-label={t("chat.uploadImages")}
							onChange={(event) => {
								interrupt();
								onFiles?.([...(event.target.files ?? [])]);
								event.target.value = "";
							}}
						/>
						<div className="composer-editor">
							<div ref={highlight} className="composer-highlight composer-text-style" aria-hidden="true">
								<SkillHighlight text={draft} bindings={bindings} />
							</div>
							<textarea
								ref={input}
								readOnly={readOnly}
								value={draft}
								onChange={(event) => {
									if (completion.inserting.current) return;
									interrupt();
									const edit = consumeEdit(latestDraft.current, event.target.value);
									latestDraft.current = event.target.value;
									if (edit) setDraft(event.target.value, edit);
									else setDraft(event.target.value);
									completion.sync(event.currentTarget, composing.current);
								}}
								onBlur={completion.close}
								onScroll={(event) => {
									if (highlight.current) {
										highlight.current.scrollTop = event.currentTarget.scrollTop;
										highlight.current.scrollLeft = event.currentTarget.scrollLeft;
									}
								}}
								onPointerDown={interrupt}
								onSelect={(event) => {
									const active = session.current;
									if (
										active &&
										(event.currentTarget.selectionStart !== active.expectedStart ||
											event.currentTarget.selectionEnd !== active.expectedEnd)
									)
										interrupt();
									completion.sync(event.currentTarget, composing.current);
								}}
								onPaste={(event) => {
									interrupt();
									const files = [...event.clipboardData.files];
									if (files.length && !disabled) {
										event.preventDefault();
										onFiles?.(files);
									}
								}}
								aria-label={placeholder}
								placeholder={placeholder}
								rows={1}
								aria-autocomplete="list"
								aria-controls={completion.token ? completion.id : undefined}
								aria-activedescendant={
									completion.token && completion.matches.length ? `${completion.id}-${completion.active}` : undefined
								}
								onCompositionStart={() => {
									interrupt();
									composing.current = true;
									completion.suspend();
								}}
								onCompositionEnd={(event) => {
									composing.current = false;
									compositionEndedAt.current = performance.now();
									completion.sync(event.currentTarget);
								}}
								onKeyDown={(event) => {
									if (completion.keyDown(event, composing.current)) return;
									if (
										event.key !== "Enter" ||
										!sendOnEnter ||
										event.shiftKey ||
										composing.current ||
										event.nativeEvent.isComposing ||
										event.nativeEvent.keyCode === 229
									)
										interrupt();
									if (!sendOnEnter || event.key !== "Enter" || event.shiftKey) return;
									// Let the IME accept its candidate; suppress only our send action.
									if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
									event.preventDefault();
									if (event.repeat || performance.now() - compositionEndedAt.current < 500) return;
									send();
								}}
								className="composer-text composer-text-style max-h-[calc(var(--control-md)*4)] min-h-[var(--composer-button-size)] min-w-0 w-full resize-none overflow-y-auto overscroll-contain bg-transparent outline-none [field-sizing:content] placeholder:text-[var(--color-text-tertiary)]"
							/>
						</div>
						<VoiceControl
							disabled={disabled || readOnly || (microphoneOccupied && !voice.isListening)}
							listening={voice.isListening}
							onStart={startVoice}
							onPause={pauseVoice}
						/>
						<button
							type="button"
							disabled={sending ? false : disconnected || (!streaming && !canSend && !voiceActive)}
							onClick={streaming ? onStop : sending ? onCancelSend : send}
							aria-label={t(streaming ? "chat.stop" : sending ? "chat.stopSend" : "chat.disabledSend")}
							className="composer-send flex size-[var(--composer-button-size)] shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-hover)] focus-visible:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--color-bg-subtle)] disabled:text-[var(--color-text-tertiary)]"
						>
							{streaming || sending ? (
								<Square size={15} fill="currentColor" aria-hidden="true" />
							) : (
								<ArrowUp size={18} strokeWidth={2.2} aria-hidden="true" />
							)}
						</button>
					</ComposerLayout>
				</ComposerFrame>
			</fieldset>
			{commandStatus}
		</div>
	);
}
