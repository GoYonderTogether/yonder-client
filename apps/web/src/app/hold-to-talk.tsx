import type { Endpoints } from "@yonder/api-client";
import { ArrowLeft, ArrowRight, AudioLines } from "lucide-react";
import { type ReactNode, type RefObject, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { type ChatVoice, voiceFiles } from "../lib/chat-voice.ts";
import { haptic } from "../lib/haptics.ts";
import { useChatVoiceCapture } from "./use-chat-voice-capture.ts";
import { useTextHold } from "./use-text-hold.ts";

type Gesture = "send" | "cancel" | "text";
type Press = { id: number | string; x: number; y: number; text?: boolean };

function gesture(press: Press, x: number, y: number): Gesture {
	const dx = x - press.x;
	if (dx <= -56) return "cancel";
	if (dx >= 56) return "text";
	if (y <= press.y - 44) return "cancel";
	return press.text ? "text" : "send";
}

function timeLabel(duration: number) {
	const seconds = Math.floor(duration / 1000);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function RecordingAction({
	disabled,
	onAction,
	children,
}: {
	disabled?: boolean | undefined;
	onAction: () => void;
	children: ReactNode;
}) {
	const pressed = useRef(false);
	return (
		<button
			type="button"
			disabled={disabled}
			onPointerDown={() => {
				pressed.current = true;
			}}
			onPointerCancel={() => {
				pressed.current = false;
			}}
			onClick={(event) => {
				// Locking can reveal this button under the held finger. A fresh tap or keyboard activation is required.
				const activate = event.detail === 0 || pressed.current;
				pressed.current = false;
				if (activate) onAction();
			}}
		>
			{children}
		</button>
	);
}

export function HoldToTalk({
	scope,
	visible,
	disabled,
	pendingMicrophonePermission,
	onSend,
	onText,
	onError,
	onActivityChange,
	knownNonce,
	transcription,
	textEditor,
	onRestore,
}: {
	scope: string;
	visible: boolean;
	disabled: boolean;
	pendingMicrophonePermission: () => Promise<void> | undefined;
	onSend: (recording: ChatVoice, signal: AbortSignal) => Promise<unknown>;
	onText: (text: string) => void;
	onError: (error: string) => void;
	onActivityChange?: ((active: boolean) => void) | undefined;
	transcription?: Pick<Endpoints, "openVoiceSocket" | "transcribeAudio"> | undefined;
	knownNonce?: ((nonce: string) => boolean) | undefined;
	textEditor: RefObject<HTMLTextAreaElement | null>;
	onRestore: () => void;
}) {
	const { t } = useTranslation();
	const voice = useChatVoiceCapture({
		scope,
		pendingPermission: pendingMicrophonePermission,
		onError,
		onActivityChange,
		knownNonce,
		openVoiceSocket: transcription?.openVoiceSocket,
	});
	const press = useRef<Press | null>(null);
	const [direction, setDirection] = useState<Gesture>("send");
	const held = voice.phase === "starting" || voice.phase === "held";
	const recording = voice.phase === "held";
	const cancelling = held && direction === "cancel";
	const wasRecording = useRef(false);
	const wasCancelling = useRef(false);
	// HEAD's tactile feedback, kept on top of main's gesture UI: recording starts with a medium bump and
	// crossing the cancel line with a selection tick, once per crossing rather than per pointer move.
	useLayoutEffect(() => {
		if (recording && !wasRecording.current) haptic("medium");
		if (held && cancelling !== wasCancelling.current) haptic("selection");
		wasRecording.current = recording;
		wasCancelling.current = cancelling;
	}, [held, recording, cancelling]);
	const finishing = voice.phase === "sending" || voice.phase === "transcribing";
	const finishLabel = voice.phase === "transcribing" ? "chat.transcribing" : "chat.sending";
	const locked = voice.phase === "locked";
	const saved = voice.phase === "saved";
	const restore = useRef(onRestore);
	restore.current = onRestore;
	const wasSaved = useRef(false);
	useLayoutEffect(() => {
		if (saved && !wasSaved.current) restore.current();
		wasSaved.current = saved;
	}, [saved]);

	async function transcribe(recording: ChatVoice, signal: AbortSignal, liveText?: string) {
		if (liveText) {
			onText(liveText);
			return;
		}
		if (!transcription) throw new Error("voice_text_unavailable");
		const parts: string[] = [];
		for (const file of voiceFiles(recording, 60_000)) {
			signal.throwIfAborted();
			const part = (await transcription.transcribeAudio(file, signal)).text.trim();
			if (part) parts.push(part);
		}
		signal.throwIfAborted();
		if (!parts.length) throw new Error("voice_text_empty");
		onText(parts.join("\n"));
	}

	function cancelPress() {
		if (!press.current) return;
		press.current = null;
		if (!voice.isLocked()) voice.cancel();
	}

	function release(id: Press["id"], action: Gesture = "send") {
		if (press.current?.id !== id) return;
		press.current = null;
		if (voice.isLocked()) return;
		if (action === "cancel") voice.cancel();
		else void voice.finish(action === "text" ? transcribe : onSend, action === "text" ? "text" : "send");
	}

	const cancelWhenDisabled = useEffectEvent(cancelPress);
	useLayoutEffect(() => {
		if (disabled && held) cancelWhenDisabled();
	}, [disabled, held]);

	useTextHold(textEditor, {
		allowed: () => !visible && !disabled && voice.phase === "idle",
		start: (event, context) => {
			press.current = { id: event.pointerId, x: event.clientX, y: event.clientY, text: true };
			setDirection("text");
			void voice.start(false, context);
		},
		move: (event) => {
			const active = press.current;
			if (active?.id === event.pointerId && !voice.isLocked())
				setDirection(gesture(active, event.clientX, event.clientY));
		},
		release: (event) => {
			const active = press.current;
			if (active) release(event.pointerId, gesture(active, event.clientX, event.clientY));
		},
		cancel: (event) => {
			if (press.current?.id === event.pointerId) cancelPress();
		},
	});
	const editorBox = textEditor.current?.parentElement;
	const hint = t(
		direction === "cancel"
			? "chat.releaseToCancel"
			: voice.phase === "starting"
				? "chat.startingRecording"
				: direction === "text"
					? "chat.releaseToText"
					: "chat.releaseToSend",
	);
	return (
		<>
			{!visible && voice.phase === "idle" && !disabled && editorBox
				? createPortal(
						<span className="composer-text-hold-hint" aria-hidden="true">
							{t("chat.holdToTranscribe")}
						</span>,
						editorBox,
					)
				: null}
			<span role="status" className="sr-only">
				{held ? hint : locked ? t("chat.voiceLocked") : finishing ? t(finishLabel) : ""}
			</span>
			{(held || locked) &&
				createPortal(
					<div
						className={held ? "composer-recording" : "composer-recording composer-recording-locked"}
						data-cancel={held && direction === "cancel" ? true : undefined}
						data-to-text={held && direction === "text" ? true : undefined}
						aria-hidden="true"
					>
						<div className="composer-recording-hint">
							{voice.preview ? (
								<div className="composer-recording-transcript">
									<span>{voice.preview}</span>
								</div>
							) : held ? (
								<div className="composer-recording-wave">
									<AudioLines aria-hidden="true" />
								</div>
							) : null}
							{held ? <span className="composer-recording-label">{hint}</span> : null}
						</div>
						{held ? (
							<div className="composer-recording-gestures">
								<span className="composer-recording-target composer-recording-target-left">
									<ArrowLeft aria-hidden="true" size="1em" />
									{t("app.cancel")}
								</span>
								<span className="composer-recording-target composer-recording-target-right">
									{direction === "text" || press.current?.text ? (
										t("chat.voiceEdit")
									) : (
										<span className="composer-recording-target-phrase">
											<span>{t("chat.voiceSlideHere")}</span> <span>{t("chat.voiceSlideToText")}</span>
										</span>
									)}
									<ArrowRight aria-hidden="true" size="1em" />
								</span>
							</div>
						) : null}
					</div>,
					document.body,
				)}
			{locked || saved ? (
				<fieldset className="composer-voice-actions" aria-label={t(saved ? "chat.voiceRecovered" : "chat.voiceLocked")}>
					<span className="composer-voice-duration" data-live={locked || undefined}>
						{timeLabel(voice.duration)}
					</span>
					<RecordingAction onAction={voice.cancel}>{t("app.cancel")}</RecordingAction>
					{voice.sendingRetry ? null : saved && !voice.atLimit ? (
						<RecordingAction disabled={disabled} onAction={() => void voice.start(true)}>
							{t("chat.voiceResume")}
						</RecordingAction>
					) : (
						<RecordingAction disabled={disabled} onAction={() => void voice.finish(transcribe, "text")}>
							{t("chat.voiceToText")}
						</RecordingAction>
					)}
					<RecordingAction
						disabled={disabled || (locked && !voice.hasAudio())}
						onAction={() => void voice.finish(onSend)}
					>
						{t(voice.sendingRetry ? "app.retry" : "chat.voiceSend")}
					</RecordingAction>
				</fieldset>
			) : null}
			{visible && !saved && (
				<button
					type="button"
					aria-label={t("chat.holdToTalk")}
					aria-busy={voice.phase === "starting" || finishing || undefined}
					tabIndex={locked ? -1 : undefined}
					className="composer-hold-to-talk"
					data-held={held || undefined}
					data-locked={locked || undefined}
					disabled={disabled || finishing || voice.phase === "loading"}
					onContextMenu={(event) => event.preventDefault()}
					onPointerDown={(event) => {
						if (event.isPrimary === false || event.button !== 0 || voice.phase !== "idle") return;
						event.currentTarget.setPointerCapture(event.pointerId);
						press.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
						setDirection("send");
						void voice.start();
					}}
					onPointerMove={(event) => {
						const active = press.current;
						if (!active || active.id !== event.pointerId || voice.isLocked()) return;
						setDirection(gesture(active, event.clientX, event.clientY));
					}}
					onPointerUp={(event) => {
						const active = press.current;
						if (active) release(event.pointerId, gesture(active, event.clientX, event.clientY));
					}}
					onPointerCancel={(event) => {
						if (press.current?.id === event.pointerId) cancelPress();
					}}
					onLostPointerCapture={(event) => {
						if (press.current?.id === event.pointerId) cancelPress();
					}}
					onBlur={cancelPress}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							press.current = null;
							voice.cancel();
						}
						if (event.key !== " " && event.key !== "Enter") return;
						event.preventDefault();
						if (!event.repeat && voice.phase === "idle") {
							press.current = { id: event.key, x: 0, y: 0 };
							setDirection("send");
							void voice.start();
						}
					}}
					onKeyUp={(event) => {
						if (event.key !== " " && event.key !== "Enter") return;
						event.preventDefault();
						release(event.key);
					}}
					onClick={(event) => {
						if (event.detail !== 0) return;
						if (press.current?.id === "assistive") release("assistive");
						else if (voice.phase === "idle") {
							press.current = { id: "assistive", x: 0, y: 0 };
							setDirection("send");
							void voice.start();
						}
					}}
				>
					<span className="truncate">{t(finishing ? finishLabel : "chat.holdToTalk")}</span>
				</button>
			)}
		</>
	);
}
