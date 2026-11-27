import { useEffect, useState } from "react";
import type { MeetingRecording } from "./types.ts";

/** An interrupted recording can be continued for this long. After that the saved audio is processed as it is. */
export const MEETING_RESUME_WINDOW_MS = 10 * 60 * 1000;

/** Storage and ownership failures leave nothing safe to append to. */
const UNRECOVERABLE = /storage|damaged|corrupt|owner_changed|capture_start_failed/;

/** Brief audio interruptions a desktop shell may recover within the current capture session. */
const AUTOMATIC = new Set(["audio_interrupted", "audio_configuration_changed", "meeting_audio_capture_interrupted"]);

/** When continuing stops being possible; null when the recording was never or is no longer continuable. */
export function resumeDeadline(recording: MeetingRecording): number | null {
	if (recording.state !== "interrupted" || recording.endedAt === null || !recording.segments.length) return null;
	if (recording.error && UNRECOVERABLE.test(recording.error)) return null;
	return recording.endedAt + MEETING_RESUME_WINDOW_MS;
}

export function resumableMeeting(recordings: MeetingRecording[], now: number): MeetingRecording | undefined {
	return recordings
		.filter((recording) => (resumeDeadline(recording) ?? 0) > now)
		.sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
}

export function automaticResume(recording: MeetingRecording): boolean {
	return recording.error !== null && AUTOMATIC.has(recording.error);
}

/** Transcription starts only once a recording is really over: ended by the user, or interrupted past the window. */
export function meetingUploadReady(recording: MeetingRecording, now: number): boolean {
	if (!recording.segments.length) return false;
	if (recording.state === "ended") return true;
	if (recording.state !== "interrupted" || recording.endedAt === null) return false;
	const deadline = resumeDeadline(recording);
	return deadline === null || now >= deadline;
}

/** The continuable recording, re-evaluated when its window closes. */
export function useResumableMeeting(recordings: MeetingRecording[]): MeetingRecording | undefined {
	const [, refresh] = useState(0);
	const found = resumableMeeting(recordings, Date.now());
	const deadline = found ? resumeDeadline(found) : null;
	useEffect(() => {
		if (deadline === null) return;
		const timer = setTimeout(() => refresh((count) => count + 1), Math.max(0, deadline - Date.now()) + 50);
		return () => clearTimeout(timer);
	}, [deadline]);
	return found;
}
