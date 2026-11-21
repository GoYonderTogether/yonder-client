import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { MEETING_RATE, meetingWav } from "../lib/browser-meeting-wav.ts";
import { haptic } from "../lib/haptics.ts";

interface Capture {
	hold: number | string;
	startY: number | undefined;
	path: string;
	chunks: Blob[];
	stream?: MediaStream;
	recorder?: MediaRecorder;
	startedAt?: number;
	limit?: ReturnType<typeof setTimeout>;
	stopping?: boolean;
	stopped?: boolean;
	released?: boolean;
}

// Match the short-speech limit and ignore accidental taps with less than 150 ms of recorded sound.
const MAX_MS = 120_000;
const MIN_MS = 150;
const CANCEL_DISTANCE = 44;

function releaseMicrophone(capture: Capture) {
	clearTimeout(capture.limit);
	if (capture.recorder?.state === "recording") {
		capture.stopping = true;
		capture.recorder.stop();
	}
	for (const track of capture.stream?.getTracks() ?? []) {
		track.onended = null;
		track.stop();
	}
	delete capture.stream;
}

function swipedUp(capture: Capture, y: number) {
	return capture.startY !== undefined && capture.startY - y >= CANCEL_DISTANCE;
}

export function HoldToTalk({
	disabled,
	onSend,
	onError,
	onActivityChange,
}: {
	disabled: boolean;
	onSend: (file: File) => Promise<unknown>;
	onError: (error: string) => void;
	onActivityChange?: ((active: boolean) => void) | undefined;
}) {
	const { t } = useTranslation();
	const [phase, setPhase] = useState<"idle" | "requesting" | "held" | "finishing">("idle");
	const [cancelOnRelease, setCancelOnRelease] = useState(false);
	const current = useRef<Capture | null>(null);
	const callbacks = useRef({ onSend, onError, onActivityChange });
	callbacks.current = { onSend, onError, onActivityChange };
	const end = useCallback((capture: Capture, visible = true) => {
		if (current.current !== capture) return;
		current.current = null;
		releaseMicrophone(capture);
		callbacks.current.onActivityChange?.(false);
		if (visible) setPhase("idle");
	}, []);
	const cancelHeld = useCallback(() => {
		const capture = current.current;
		if (capture && !capture.released) end(capture);
	}, [end]);
	useLayoutEffect(() => {
		const hidden = () => {
			if (document.hidden) cancelHeld();
		};
		document.addEventListener("visibilitychange", hidden);
		window.addEventListener("pagehide", cancelHeld);
		return () => {
			document.removeEventListener("visibilitychange", hidden);
			window.removeEventListener("pagehide", cancelHeld);
			if (current.current) end(current.current, false);
		};
	}, [cancelHeld, end]);
	useLayoutEffect(() => {
		if (disabled) cancelHeld();
	}, [cancelHeld, disabled]);

	async function sendRecording(capture: Capture) {
		if (current.current !== capture) return;
		try {
			if (!capture.chunks.length) return;
			let file: File;
			try {
				const decoder = new OfflineAudioContext(1, 1, MEETING_RATE);
				const audio = await decoder.decodeAudioData(await new Blob(capture.chunks).arrayBuffer());
				if (current.current !== capture || audio.length < (MEETING_RATE * MIN_MS) / 1000) return;
				const frames = Math.min(audio.length, (MEETING_RATE * MAX_MS) / 1000);
				file = new File([meetingWav(audio, 0, frames)], "voice.wav", { type: "audio/wav" });
			} catch {
				if (current.current === capture) callbacks.current.onError("chat.recordingFailed");
				return;
			}
			await callbacks.current.onSend(file);
		} catch {
			if (current.current === capture) callbacks.current.onError("chat.sendFailed");
		} finally {
			end(capture);
		}
	}

	async function begin(hold: Capture["hold"], startY?: number) {
		if (disabled || current.current) return;
		if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder || !globalThis.OfflineAudioContext) {
			onError("chat.voiceUnsupported");
			return;
		}
		const capture: Capture = { hold, startY, path: window.location.pathname, chunks: [] };
		current.current = capture;
		setCancelOnRelease(false);
		setPhase("requesting");
		onError("");
		onActivityChange?.(true);
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			capture.stream = stream;
			if (current.current !== capture) {
				releaseMicrophone(capture);
				return;
			}
			const recorder = new MediaRecorder(stream);
			capture.recorder = recorder;
			const interrupted = () => {
				if (current.current !== capture) return;
				onError("chat.recordingFailed");
				end(capture);
			};
			for (const track of stream.getAudioTracks()) track.onended = interrupted;
			recorder.onerror = interrupted;
			recorder.onstart = () => {
				if (current.current !== capture) return;
				capture.startedAt = performance.now();
				capture.limit = setTimeout(() => releaseMicrophone(capture), MAX_MS);
				haptic("medium");
				setPhase("held");
			};
			recorder.ondataavailable = ({ data }) => {
				if (current.current === capture && data.size) capture.chunks.push(data);
			};
			recorder.onstop = () => {
				if (current.current !== capture) return;
				if (!capture.stopping) return interrupted();
				capture.stopped = true;
				callbacks.current.onActivityChange?.(false);
				if (capture.released) void sendRecording(capture);
			};
			recorder.start();
		} catch (error) {
			if (current.current !== capture) return;
			onError(
				error instanceof DOMException && error.name === "NotAllowedError"
					? "chat.microphoneDenied"
					: "chat.recordingFailed",
			);
			end(capture);
		}
	}

	function finish(hold: Capture["hold"]) {
		const capture = current.current;
		if (!capture || capture.hold !== hold || capture.released) return;
		// Navigation can update the URL before the previous composer unmounts.
		if (
			capture.path !== window.location.pathname ||
			capture.startedAt === undefined ||
			performance.now() - capture.startedAt < MIN_MS
		) {
			end(capture);
			return;
		}
		capture.released = true;
		setPhase("finishing");
		releaseMicrophone(capture);
		if (capture.stopped) void sendRecording(capture);
	}

	const busyLabel =
		phase === "requesting" ? "chat.requestingMicrophone" : phase === "finishing" ? "chat.sending" : undefined;
	const recording = phase === "held";
	const hint = t(cancelOnRelease ? "chat.releaseToCancel" : "chat.releaseToSend");
	return (
		<>
			<span role="status" className="sr-only">
				{recording ? hint : busyLabel ? t(busyLabel) : ""}
			</span>
			{recording &&
				createPortal(
					<div className="composer-recording" data-cancel={cancelOnRelease || undefined} aria-hidden="true">
						<span className="composer-recording-label">{hint}</span>
					</div>,
					document.body,
				)}
			<button
				type="button"
				aria-label={t("chat.holdToTalk")}
				aria-busy={busyLabel ? true : undefined}
				className="composer-hold-to-talk"
				data-held={recording || undefined}
				disabled={disabled}
				onContextMenu={(event) => event.preventDefault()}
				onPointerDown={(event) => {
					if (event.isPrimary === false || event.button !== 0 || current.current) return;
					event.currentTarget.setPointerCapture(event.pointerId);
					void begin(event.pointerId, event.clientY);
				}}
				onPointerMove={(event) => {
					const capture = current.current;
					if (capture?.hold !== event.pointerId || capture.released) return;
					const cancel = swipedUp(capture, event.clientY);
					if (cancel !== cancelOnRelease) haptic("selection");
					setCancelOnRelease(cancel);
				}}
				onPointerUp={(event) => {
					const capture = current.current;
					if (capture?.hold !== event.pointerId) return;
					if (swipedUp(capture, event.clientY)) cancelHeld();
					else finish(event.pointerId);
				}}
				onPointerCancel={(event) => {
					if (current.current?.hold === event.pointerId) cancelHeld();
				}}
				onLostPointerCapture={(event) => {
					if (current.current?.hold === event.pointerId) cancelHeld();
				}}
				onBlur={cancelHeld}
				onKeyDown={(event) => {
					if (event.key === "Escape") cancelHeld();
					if (event.key !== " " && event.key !== "Enter") return;
					event.preventDefault();
					if (!event.repeat) void begin(event.key);
				}}
				onKeyUp={(event) => {
					if (event.key !== " " && event.key !== "Enter") return;
					event.preventDefault();
					finish(event.key);
				}}
				onClick={(event) => {
					// An assistive activation can start and stop capture without a held key or pointer.
					if (event.detail !== 0) return;
					if (current.current) finish("assistive");
					else void begin("assistive");
				}}
			>
				<span className="truncate">{t(busyLabel ?? "chat.holdToTalk")}</span>
			</button>
		</>
	);
}
