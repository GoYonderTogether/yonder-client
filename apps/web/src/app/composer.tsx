import { ComposerFrame, ComposerLayout } from "@yonder/chat-presentation";
import { ArrowUp, Keyboard, Mic, Plus, Square } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { prepareIosChatMicrophone } from "../lib/ios-chat-microphone.ts";
import { CompletionPopup } from "./completion/completion-popup.tsx";
import { CompletionHighlight } from "./completion/highlight.tsx";
import { useComposerCompletion } from "./completion/use-composer-completion.ts";
import { useTextareaEdit } from "./completion/use-textarea-edit.ts";
import { ComposerAttachmentMenu, ComposerFileInputs } from "./composer-attachment-menu.tsx";
import { ComposerFiles } from "./composer-files.tsx";
import {
	IosAttachmentSendStatus,
	IosComposerAttachmentPanel,
	useIosComposerAttachments,
} from "./composer-ios-attachments.tsx";
import { isFileDrag } from "./file-drop-zone.tsx";
import { HoldToTalk } from "./hold-to-talk.tsx";
import { CHAT_ATTACHMENT_LIMIT } from "./use-chat-draft.ts";
import { useComposerVoice } from "./use-composer-voice.ts";
import { VoiceControl } from "./voice-control.tsx";
import "./composer.css";
import type { ComposerProps } from "./composer-props.ts";

/**
 * The one composer (11 第七节第 3 条). It is mounted once by the frame and stays mounted across tabs,
 * so what was typed survives a tab switch.
 */
export function Composer({
	recipientName,
	draft,
	onDraftChange: setDraft,
	onSend,
	onSendVoice,
	speech,
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
	pickedFiles,
	onRemoveFile,
	onRetryFile,
	onOriginalFileChange,
	mobilePicker = false,
	showMobilePlaceholder = false,
	onMeeting,
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
	const cameraPicker = useRef<HTMLInputElement>(null);
	const legacyPickerScope = useRef<string | undefined>(undefined);
	const addMenu = useRef<HTMLDivElement>(null);
	const menuPanel = useRef<HTMLFieldSetElement>(null);
	const [menuScope, setMenuScope] = useState<string>();
	const menu = menuScope === scope;
	if (menuScope !== undefined && !menu) setMenuScope(undefined);
	const [voiceScope, setVoiceScope] = useState<string | null>(null);
	const microphonePreparation = useRef<Promise<void> | undefined>(undefined);
	const [holdError, setHoldError] = useState<{ scope: string; message: string }>();
	useEffect(() => {
		const root = addMenu.current;
		if (!menu || !root) return;
		const outsideEvent = mobilePicker ? "click" : "pointerdown";
		const dismiss = (event: Event) => {
			const path = event.composedPath();
			if (!path.includes(root) && (!menuPanel.current || !path.includes(menuPanel.current))) setMenuScope(undefined);
		};
		root.ownerDocument.addEventListener(outsideEvent, dismiss, true);
		return () => root.ownerDocument.removeEventListener(outsideEvent, dismiss, true);
	}, [menu, mobilePicker]);
	const [expanded, setExpanded] = useState(false);
	const [dragging, setDragging] = useState(false);
	const dragDepth = useRef(0);
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
	const hasContent = Boolean(draft.trim() || files.length);
	const holdMode = mobilePicker && voiceScope === scope;
	const compactMobile = mobilePicker && (!draft || holdMode);
	const showSend = !mobilePicker || streaming || sending || (hasContent && !holdMode);
	const voiceUnavailable = disabled || readOnly || disconnected || microphoneOccupied || !onSendVoice;
	const canSend = !disabled && !disconnected && !streaming && hasContent;
	function toggleVoiceMode() {
		setHoldError(undefined);
		if (holdMode) {
			flushSync(() => setVoiceScope(null));
			input.current?.focus({ preventScroll: true });
		} else {
			input.current?.blur();
			const preparation = microphonePreparation.current ?? prepareIosChatMicrophone();
			microphonePreparation.current = preparation;
			void preparation?.then(() => {
				if (microphonePreparation.current === preparation) microphonePreparation.current = undefined;
			});
			setVoiceScope(scope);
		}
	}
	function addDraftFiles(files: File[]) {
		if (files.length) setVoiceScope(null);
		onFiles?.(files);
	}
	function fillVoiceDraft(text: string) {
		setDraft([latestDraft.current, text].filter(Boolean).join("\n"));
		setVoiceScope(null);
	}
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
	const {
		voice,
		active: voiceActive,
		interrupt,
		startVoice,
		pauseVoice,
		send,
		latestDraft,
		selectionMoved,
	} = useComposerVoice({
		scope,
		draft,
		onDraftChange: setDraft,
		onSend,
		editor: input,
		sending,
		disabled,
		disconnected,
		streaming,
		canSend,
		hasFiles: files.length > 0,
		microphoneOccupied,
		onActivityChange: mobilePicker ? undefined : onVoiceActivityChange,
	});
	const attachmentPickerBlocked = Boolean(pickedFiles && (streaming || pickedFiles.failed));
	const iosAttachments = useIosComposerAttachments({
		scope,
		mobile: mobilePicker,
		enabled: !disabled && !readOnly && !sending && !attachmentPickerBlocked,
		direct: Boolean(pickedFiles),
		limit: pickedFiles ? CHAT_ATTACHMENT_LIMIT : Math.max(0, CHAT_ATTACHMENT_LIMIT - files.length),
		addButton: addMenu,
		onFiles: (selected, original) => {
			interrupt();
			if (pickedFiles) pickedFiles.send(selected, original);
			else addDraftFiles(selected);
		},
	});
	const issue = iosAttachments.issue;
	const pickError =
		issue === "fileTooLarge" || issue === "tooManyFiles" ? `chat.${issue}` : issue && `composerAttachments.${issue}`;
	const visibleError = pickError || error || voice.error || (holdError?.scope === scope ? holdError.message : "");

	function openFileInput(input: HTMLInputElement | null) {
		legacyPickerScope.current = scope;
		input?.click();
	}
	function receiveFileInput(selected: File[], original: boolean) {
		const requestedScope = legacyPickerScope.current;
		legacyPickerScope.current = undefined;
		interrupt();
		if (mobilePicker && requestedScope !== undefined && requestedScope !== scope) return;
		if (mobilePicker && pickedFiles && requestedScope !== undefined) {
			pickedFiles.send(selected, original);
			return;
		}
		addDraftFiles(selected);
	}

	const attachmentMenu =
		!iosAttachments.iphone && menu ? (
			<ComposerAttachmentMenu
				panel={menuPanel}
				mobile={mobilePicker}
				direct={Boolean(mobilePicker && pickedFiles)}
				onImages={mobilePicker ? () => openFileInput(imagePicker.current) : undefined}
				onCamera={mobilePicker ? () => openFileInput(cameraPicker.current) : undefined}
				onFiles={() => openFileInput(picker.current)}
				onMeeting={onMeeting}
				onClose={() => setMenuScope(undefined)}
			/>
		) : null;
	const addControl = (
		<div ref={addMenu} className="composer-add">
			<button
				type="button"
				className="composer-tool"
				disabled={
					disabled ||
					(mobilePicker && attachmentPickerBlocked) ||
					(iosAttachments.iphone && (readOnly || sending || iosAttachments.importing))
				}
				aria-label={t("chat.attach")}
				aria-expanded={mobilePicker || onMeeting ? iosAttachments.open || menu : undefined}
				onClick={() => {
					if (mobilePicker) input.current?.blur();
					if (iosAttachments.iphone) iosAttachments.toggle();
					else if (mobilePicker || onMeeting) setMenuScope(menu ? undefined : scope);
					else picker.current?.click();
				}}
			>
				<Plus size={21} aria-hidden="true" />
			</button>
			{!mobilePicker ? attachmentMenu : null}
		</div>
	);

	return (
		<div
			data-composer-mobile={mobilePicker || undefined}
			data-mobile-send={(mobilePicker && showSend) || undefined}
			className="relative flex flex-col gap-[var(--spacing-2)]"
		>
			{visibleError ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{t(visibleError)}
				</p>
			) : null}
			<IosAttachmentSendStatus
				pickedFiles={pickedFiles}
				importing={iosAttachments.importing}
				disabled={disabled || streaming}
			/>
			<fieldset
				aria-label={t("chat.attach")}
				className={iosAttachments.iphone ? "min-w-0" : undefined}
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
						addDraftFiles([...event.dataTransfer.files]);
					}
				}}
			>
				<ComposerFrame as="div" dragging={dragging}>
					<CompletionPopup completion={completion} />
					{files.length ? (
						<ComposerFiles
							files={files}
							disabled={disabled}
							iphonePhotos={iosAttachments.iphone}
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
					<ComposerLayout
						as="div"
						expanded={!compactMobile && Boolean(expanded || draft.includes("\n") || files.length)}
					>
						{mobilePicker ? (
							<button
								type="button"
								className="composer-tool composer-mobile-toggle"
								aria-label={t(holdMode ? "chat.textInput" : "chat.voiceInput")}
								disabled={iosAttachments.importing || (!holdMode && voiceUnavailable)}
								onClick={toggleVoiceMode}
							>
								{holdMode ? <Keyboard size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
							</button>
						) : (
							addControl
						)}
						<ComposerFileInputs
							files={picker}
							images={imagePicker}
							camera={mobilePicker && !iosAttachments.iphone ? cameraPicker : undefined}
							onFiles={receiveFileInput}
						/>
						<div className="composer-editor" hidden={holdMode}>
							<div ref={highlight} className="composer-highlight composer-text-style" aria-hidden="true">
								<CompletionHighlight text={draft} bindings={bindings} token={completion.token} />
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
								onFocus={iosAttachments.close}
								onScroll={(event) => {
									if (highlight.current) {
										highlight.current.scrollTop = event.currentTarget.scrollTop;
										highlight.current.scrollLeft = event.currentTarget.scrollLeft;
									}
								}}
								onPointerDown={interrupt}
								onSelect={(event) => {
									if (selectionMoved(event.currentTarget)) interrupt();
									completion.sync(event.currentTarget, composing.current);
								}}
								onPaste={(event) => {
									interrupt();
									const files = [...event.clipboardData.files];
									if (files.length && !disabled) {
										event.preventDefault();
										addDraftFiles(files);
									}
								}}
								aria-label={placeholder}
								placeholder={mobilePicker && !showMobilePlaceholder ? undefined : placeholder}
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
									// Leave candidate confirmation to the IME, even if its key looks like Enter.
									if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
										interrupt();
										return;
									}
									const enter = event.key === "Enter" && !event.shiftKey;
									if (
										enter &&
										(sendOnEnter || completion.matches.length > 0) &&
										(event.repeat || performance.now() - compositionEndedAt.current < 500)
									) {
										event.preventDefault();
										return;
									}
									if (completion.keyDown(event)) return;
									if (!enter || !sendOnEnter) {
										interrupt();
										return;
									}
									event.preventDefault();
									send();
								}}
								data-empty={mobilePicker && !draft ? true : undefined}
								className="composer-text composer-text-style max-h-[calc(var(--control-md)*4)] min-h-[var(--composer-button-size)] min-w-0 w-full resize-none overflow-y-auto overscroll-contain bg-transparent outline-none [field-sizing:content] placeholder:text-[var(--color-text-tertiary)]"
							/>
						</div>
						{mobilePicker && onSendVoice ? (
							<HoldToTalk
								key={scope}
								scope={scope}
								visible={holdMode}
								{...speech}
								textEditor={input}
								disabled={voiceUnavailable || menu || iosAttachments.busy || sending || streaming}
								pendingMicrophonePermission={() => microphonePreparation.current}
								onSend={onSendVoice}
								onText={fillVoiceDraft}
								onRestore={() => setVoiceScope(scope)}
								onError={(message) => setHoldError({ scope, message })}
								onActivityChange={onVoiceActivityChange}
							/>
						) : null}
						{!mobilePicker ? (
							<VoiceControl
								disabled={disabled || readOnly || (microphoneOccupied && !voice.isListening)}
								listening={voice.isListening}
								onStart={startVoice}
								onPause={pauseVoice}
							/>
						) : null}
						{showSend ? (
							<button
								type="button"
								disabled={
									iosAttachments.importing || (!sending && (streaming || disconnected || (!canSend && !voiceActive)))
								}
								onClick={sending ? onCancelSend : send}
								aria-label={t(sending ? "chat.stopSend" : "chat.disabledSend")}
								className="composer-send flex size-[var(--composer-button-size)] shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-hover)] focus-visible:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--color-bg-subtle)] disabled:text-[var(--color-text-tertiary)]"
							>
								{sending ? (
									<Square size={15} fill="currentColor" aria-hidden="true" />
								) : (
									<ArrowUp size={18} strokeWidth={2.2} aria-hidden="true" />
								)}
							</button>
						) : null}
						{mobilePicker ? addControl : null}
					</ComposerLayout>
				</ComposerFrame>
			</fieldset>
			{mobilePicker && !attachmentPickerBlocked ? attachmentMenu : null}
			{iosAttachments.open ? (
				<IosComposerAttachmentPanel key={scope} picker={iosAttachments} onMeeting={onMeeting} />
			) : null}
			{commandStatus}
		</div>
	);
}
