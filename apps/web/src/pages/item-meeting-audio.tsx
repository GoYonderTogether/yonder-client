import { recordingDuration } from "@yonder/feature-meetings";
import type { MeetingRecord } from "@yonder/protocol";
import { IconButton } from "@yonder/ui-components";
import { ApiError, chatCacheGeneration, loadMedia, useApi } from "@yonder/ui-data";
import { LoaderCircle, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { meetingAudioTimeline, playMeetingAudio } from "../lib/meeting-audio-playback.ts";
import { readMeetingAudio } from "../lib/meeting-recorder.ts";

type AudioState = "idle" | "loading" | "playing" | "unavailable" | "error";
class RecordingAudioUnavailable extends Error {}

function time(ms: number) {
	return recordingDuration(ms).replace(/^00:/, "");
}

export function MeetingAudio({ meeting, ownerId }: { meeting: MeetingRecord; ownerId: string }) {
	const { t } = useTranslation();
	const api = useApi();
	const player = useRef<HTMLElement>(null);
	const context = useRef<AudioContext | null>(null);
	const playback = useRef<ReturnType<typeof playMeetingAudio> | null>(null);
	const scrub = useRef<boolean | null>(null);
	const [state, setState] = useState<AudioState>("idle");
	const [position, setPosition] = useState(0);
	const timeline = useMemo(() => meetingAudioTimeline(meeting.segments), [meeting.segments]);
	const duration = timeline.at(-1)?.end ?? 0;
	const active = state === "playing" || state === "loading";

	const pause = useCallback(() => {
		const session = playback.current;
		if (!session) return;
		playback.current = null;
		setPosition(session.position());
		session.stop();
		setState("idle");
	}, []);

	useEffect(() => {
		const element = player.current;
		if (!element || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(([entry]) => {
			if (entry && !entry.isIntersecting) pause();
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [pause]);

	useEffect(
		() => () => {
			playback.current?.stop();
			playback.current = null;
			void context.current?.close().catch(() => {});
			context.current = null;
		},
		[],
	);

	useEffect(() => {
		if (meeting.audioRetained === false) pause();
	}, [meeting.audioRetained, pause]);

	useEffect(() => {
		if (state !== "playing") return;
		const timer = window.setInterval(() => {
			const session = playback.current;
			if (session) setPosition(session.position());
		}, 100);
		return () => window.clearInterval(timer);
	}, [state]);

	function play(from: number) {
		playback.current?.stop();
		const start = from < duration ? from : 0;
		setPosition(start);
		setState("loading");
		try {
			context.current ??= new AudioContext();
			const generation = chatCacheGeneration();
			const session = playMeetingAudio(
				context.current,
				timeline,
				start,
				async (part, signal) => {
					const valid = () => {
						signal.throwIfAborted();
						if (generation !== chatCacheGeneration()) throw new RecordingAudioUnavailable();
					};
					let local: Awaited<ReturnType<typeof readMeetingAudio>> | undefined;
					try {
						local = await readMeetingAudio(ownerId, meeting.clientRecordingId, part.index);
					} catch {
						signal.throwIfAborted();
					}
					valid();
					if (local) return new Uint8Array(local).buffer;
					if (!part.uploaded || meeting.audioRetained === false) throw new RecordingAudioUnavailable();
					try {
						const media = await loadMedia(ownerId, { meetingId: meeting.id, segmentIndex: part.index }, "original", {
							sign: () => api.meetingAudioDownload(meeting.id, part.index, signal),
							local: () => api.meetingAudio(meeting.id, part.index, signal),
							kind: "audio",
							byteLength: part.byteLength,
							signal,
						});
						valid();
						if (!media) throw new RecordingAudioUnavailable();
						return await media.blob.arrayBuffer();
					} catch (error) {
						if (error instanceof ApiError && error.status === 404) throw new RecordingAudioUnavailable();
						throw error;
					}
				},
				() => setState("playing"),
			);
			playback.current = session;
			void session.done.then(
				() => {
					if (playback.current !== session) return;
					playback.current = null;
					setPosition(duration);
					setState("idle");
				},
				(error: unknown) => {
					if (playback.current !== session) return;
					pause();
					setState(error instanceof RecordingAudioUnavailable ? "unavailable" : "error");
				},
			);
		} catch {
			setState("error");
		}
	}

	function seek(to: number, resume = Boolean(playback.current)) {
		if (resume && to < duration) play(to);
		else {
			pause();
			setPosition(to);
		}
	}

	function finishScrub(to: number) {
		const resume = scrub.current;
		if (resume === null) return;
		scrub.current = null;
		seek(to, resume);
	}

	const label = t(active ? "meetingRecorder.pausePlayback" : "meetingRecorder.play");
	const Icon = state === "loading" ? LoaderCircle : active ? Pause : Play;
	const failure =
		state === "unavailable"
			? t("meetingRecorder.archiveAudioUnavailable")
			: state === "error"
				? t("meetingRecorder.playFailed")
				: null;

	return (
		<section className="recording-audio col-span-full" aria-label={t("meetingRecorder.archiveAudio")} ref={player}>
			<p className="text-caption font-medium">{t("meetingRecorder.archiveAudio")}</p>
			<div className="flex items-center gap-[var(--spacing-3)]">
				<IconButton
					aria-label={label}
					aria-busy={state === "loading" || undefined}
					title={label}
					variant="primary"
					className="shrink-0 rounded-[var(--radius-full)]"
					onClick={() => (active ? pause() : play(position))}
				>
					<Icon
						aria-hidden="true"
						className={state === "loading" ? "motion-safe:animate-spin" : undefined}
						fill={state === "loading" ? "none" : "currentColor"}
					/>
				</IconButton>
				<div className="min-w-0 flex-1">
					<input
						className="recording-audio-seek"
						type="range"
						min={0}
						max={duration}
						step="any"
						value={Math.min(position, duration)}
						aria-label={t("meetingRecorder.playbackPosition")}
						aria-valuetext={time(position)}
						onPointerDown={(event) => {
							if (!event.isPrimary || event.button !== 0) return;
							scrub.current = Boolean(playback.current);
							pause();
						}}
						onPointerUp={(event) => finishScrub(event.currentTarget.valueAsNumber)}
						onPointerCancel={(event) => finishScrub(event.currentTarget.valueAsNumber)}
						onChange={(event) => {
							const to = event.currentTarget.valueAsNumber;
							if (scrub.current !== null) setPosition(to);
							else seek(to);
						}}
					/>
					<div className="flex justify-between text-micro tabular-nums text-[var(--color-text-secondary)]">
						<span>{time(position)}</span>
						<span>{time(duration)}</span>
					</div>
				</div>
			</div>
			{failure ? (
				<p className="text-caption text-[var(--color-text-secondary)]" role="status">
					{failure}
				</p>
			) : null}
		</section>
	);
}
