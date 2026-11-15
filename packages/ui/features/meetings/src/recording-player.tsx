import { Button } from "@yonder/ui-components";
import { Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MeetingRecorderController, MeetingRecording } from "./types.ts";

/** Only one persisted segment is loaded at a time, even for a long recording. */
export function RecordingPlayer({
	recording,
	readAudio,
}: {
	recording: MeetingRecording;
	readAudio: MeetingRecorderController["readAudio"];
}) {
	const { t } = useTranslation();
	const [playing, setPlaying] = useState(false);
	const [failed, setFailed] = useState(false);
	const attempt = useRef(0);
	const player = useRef<HTMLAudioElement | null>(null);
	const url = useRef<string | null>(null);
	function release() {
		player.current?.pause();
		player.current = null;
		if (url.current) URL.revokeObjectURL(url.current);
		url.current = null;
	}
	function stop() {
		attempt.current++;
		release();
		setPlaying(false);
	}
	useEffect(
		() => () => {
			attempt.current++;
			player.current?.pause();
			if (url.current) URL.revokeObjectURL(url.current);
		},
		[],
	);
	async function play() {
		const token = ++attempt.current;
		setFailed(false);
		setPlaying(true);
		async function segment(position: number): Promise<void> {
			const part = recording.segments[position];
			if (!part || token !== attempt.current) {
				if (token === attempt.current) stop();
				return;
			}
			const bytes = await readAudio(recording.id, part.index);
			if (token !== attempt.current) return;
			release();
			url.current = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "audio/wav" }));
			const audio = new Audio(url.current);
			player.current = audio;
			audio.onended = () => void segment(position + 1).catch(fail);
			audio.onerror = fail;
			await audio.play();
		}
		function fail() {
			if (token !== attempt.current) return;
			stop();
			setFailed(true);
		}
		await segment(0).catch(fail);
	}
	return (
		<div className="flex flex-wrap items-center gap-[var(--spacing-3)]">
			<Button
				size="sm"
				disabled={!recording.segments.length}
				onClick={() => (playing ? stop() : void play())}
				aria-label={t(playing ? "meetingRecorder.stopPlayback" : "meetingRecorder.play")}
			>
				{playing ? <Square size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
				{t(playing ? "meetingRecorder.stopPlayback" : "meetingRecorder.play")}
			</Button>
			{failed ? (
				<span role="alert" className="text-caption text-[var(--color-danger)]">
					{t("meetingRecorder.playFailed")}
				</span>
			) : null}
		</div>
	);
}
