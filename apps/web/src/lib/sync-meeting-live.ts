import type { createEndpoints } from "@yonder/api-client";
import { MEETING_RESUME_WINDOW_MS, type MeetingRecording, meetingUploadReady } from "@yonder/feature-meetings";
import type { LiveMeetingCaptureState, LiveMeetingProgress } from "@yonder/protocol";

import { normalizeRecordingLocality } from "./recording-locality.ts";

type LiveApi = Pick<
	ReturnType<typeof createEndpoints>,
	"startLiveMeeting" | "liveMeeting" | "checkpointLiveMeeting" | "uploadLiveMeetingSegment" | "finalizeLiveMeeting"
>;

function readyToSeal(recording: MeetingRecording, now: number, photoCount: number) {
	return (
		meetingUploadReady(recording, now) ||
		(!recording.segments.length &&
			photoCount > 0 &&
			recording.endedAt !== null &&
			(recording.state === "ended" ||
				(recording.state === "interrupted" && now >= recording.endedAt + MEETING_RESUME_WINDOW_MS)))
	);
}

export function shouldSyncMeeting(recording: MeetingRecording, now: number, photoCount = 0): boolean {
	return Boolean(
		recording.conversationId &&
			recording.transportMode &&
			((recording.transportMode === "live" && recording.segments.length) || readyToSeal(recording, now, photoCount)),
	);
}

export async function syncMeetingLive({
	api,
	recording,
	meetingId,
	captureState,
	notifyInterruption,
	localPhotoCount = 0,
	locality,
	readAudio,
	drainPhotos,
	signal,
	assertOwner,
	onProgress,
}: {
	api: LiveApi;
	recording: MeetingRecording;
	meetingId?: string | undefined;
	captureState?: LiveMeetingCaptureState | undefined;
	notifyInterruption?: boolean;
	localPhotoCount?: number;
	locality?: string;
	readAudio: (recordingId: string, index: number) => Promise<Uint8Array>;
	drainPhotos: (meetingId: string) => Promise<number>;
	signal: AbortSignal;
	assertOwner: () => void;
	onProgress: (progress: LiveMeetingProgress) => void;
}): Promise<boolean> {
	function assertCurrent() {
		signal.throwIfAborted();
		assertOwner();
	}
	const { id, conversationId, segments, startedAt, title, transportMode } = recording;
	if (!conversationId || !transportMode || !shouldSyncMeeting(recording, Date.now(), localPhotoCount)) return false;
	assertCurrent();
	let status = meetingId
		? await api.liveMeeting(meetingId, signal)
		: await api.startLiveMeeting({ clientRecordingId: id, conversationId, startedAt, title, transportMode }, signal);
	const verifiedId = meetingId ?? status.meetingId;
	function observe() {
		assertCurrent();
		if (
			!verifiedId ||
			status.meetingId !== verifiedId ||
			!Number.isSafeInteger(status.nextSegmentIndex) ||
			status.nextSegmentIndex < 0
		)
			throw new Error("invalid_live_cursor");
		onProgress(status);
	}
	observe();
	const endReady = () =>
		readyToSeal(recording, Date.now(), localPhotoCount) && status.nextSegmentIndex === segments.length;
	// A previous seal may have succeeded even if its response was lost.
	if (!status.recording) return endReady();
	if (recording.transportMode === "live") {
		if (notifyInterruption && status.captureState !== "interrupted") {
			status = await api.checkpointLiveMeeting(verifiedId, "interrupted", signal);
			observe();
		}
		if (captureState && status.captureState !== captureState) {
			status = await api.checkpointLiveMeeting(verifiedId, captureState, signal);
			observe();
		}
	}

	// Bound each pass so a long offline backlog cannot monopolize a running recording.
	for (let sent = 0; sent < 4 && status.nextSegmentIndex < segments.length; sent++) {
		const index = status.nextSegmentIndex;
		if (segments[index]?.index !== index) throw new Error("missing_local_recording_segment");
		assertCurrent();
		const bytes = await readAudio(id, index);
		assertCurrent();
		status = await api.uploadLiveMeetingSegment(verifiedId, index, new Blob([new Uint8Array(bytes)]), signal);
		observe();
		if (status.nextSegmentIndex <= index) throw new Error("unacknowledged_live_segment");
		if (!status.recording) return endReady();
	}
	const { endedAt, state } = recording;
	if (!endReady() || endedAt === null || state === "recording") return false;
	assertCurrent();
	const photoCount = await drainPhotos(verifiedId);
	if (!segments.length && !photoCount) return false;
	assertCurrent();
	const label = normalizeRecordingLocality(locality);
	await api.finalizeLiveMeeting(
		verifiedId,
		{ endedAt, state, segmentCount: segments.length, photoCount, ...(label ? { locality: label } : {}) },
		signal,
	);
	assertCurrent();
	return true;
}
