import type { Attachment } from "@yonder/protocol";
import { AudioLines, LoaderCircle, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAttachmentBlob } from "../preview/use-attachment-blob.ts";

type PlaybackState = "idle" | "loading" | "playing" | "paused" | "error";
type Playback = { context: AudioContext; finish: (state?: PlaybackState) => void };
let stopPreviousVoice: (() => void) | undefined;

export function VoiceMessage({
	attachment,
	additional = [],
	durationMs,
	self,
}: {
	attachment: Attachment;
	additional?: Attachment[];
	durationMs: number;
	self: boolean;
}) {
	const { t } = useTranslation();
	const { load, loadPart } = useAttachmentBlob(attachment);
	const [state, setState] = useState<PlaybackState>("idle");
	const playback = useRef<Playback | null>(null);
	useEffect(() => () => playback.current?.finish(), []);

	async function togglePlayback() {
		if (state === "loading") return;
		const running = playback.current;
		if (running) {
			try {
				await (state === "playing" ? running.context.suspend() : running.context.resume());
			} catch {
				running.finish("error");
			}
			return;
		}

		let context: AudioContext;
		try {
			context = new AudioContext();
		} catch {
			setState("error");
			return;
		}
		stopPreviousVoice?.();
		const stop = () => finish("idle");
		function finish(next?: PlaybackState) {
			if (playback.current?.context !== context) return;
			playback.current = null;
			if (stopPreviousVoice === stop) stopPreviousVoice = undefined;
			context.onstatechange = null;
			void context.close().catch(() => {});
			if (next) setState(next);
		}
		playback.current = { context, finish };
		stopPreviousVoice = stop;
		setState("loading");
		const ids = additional.map(({ id }) => id);
		async function playPart(part: Promise<Blob | undefined>, index: number) {
			const blob = await part;
			if (playback.current?.context !== context) return;
			if (!blob) throw new Error("voice_part_missing");
			const decoder = ids.length ? new OfflineAudioContext(1, 1, 16_000) : context;
			const buffer = await decoder.decodeAudioData(await blob.arrayBuffer());
			if (playback.current?.context !== context) return;
			const source = context.createBufferSource();
			source.buffer = buffer;
			source.connect(context.destination);
			const next = ids[index];
			source.onended = next
				? () => {
						if (playback.current?.context === context)
							void playPart(loadPart(next), index + 1).catch(() => finish("error"));
					}
				: stop;
			const update = () => setState(context.state === "running" ? "playing" : "paused");
			context.onstatechange = update;
			source.start();
			update();
		}
		try {
			// Unlock audio in this click. The private file may take longer than the activation lasts.
			const [, blob] = await Promise.all([context.resume(), load()]);
			await playPart(Promise.resolve(blob), 0);
		} catch {
			finish("error");
		}
	}

	const seconds = Math.ceil(durationMs / 1000);
	const duration =
		seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : `${seconds}″`;
	const playing = state === "playing";
	const loading = state === "loading";
	const failed = state === "error";
	const Icon = loading ? LoaderCircle : failed ? RotateCcw : playing ? Pause : Play;
	const label = loading
		? t("app.loading")
		: failed
			? t("chat.voicePlaybackFailed")
			: t(playing ? "chat.pauseVoice" : "chat.playVoice");
	return (
		<button
			type="button"
			className={`message-bubble message-voice-button ${self ? "message-bubble-outgoing" : "message-bubble-incoming"}`}
			aria-label={`${label} · ${duration}`}
			aria-busy={loading || undefined}
			data-voice-state={state}
			disabled={loading}
			onClick={() => void togglePlayback()}
		>
			<Icon aria-hidden="true" size={17} className={loading ? "motion-safe:animate-spin" : undefined} />
			<AudioLines aria-hidden="true" size={22} className="message-voice-wave" />
			<span className="message-voice-duration">{duration}</span>
			{failed ? (
				<span className="sr-only" role="status">
					{label}
				</span>
			) : null}
		</button>
	);
}
