import type { createEndpoints } from "@yonder/api-client";
import type { MeetingRecording } from "@yonder/feature-meetings";

export async function uploadMeetingAudio(
	api: Pick<ReturnType<typeof createEndpoints>, "createMeeting" | "uploadMeetingSegment" | "processMeeting">,
	recording: MeetingRecording,
	conversationId: string,
	read: (id: string, index: number) => Promise<Uint8Array>,
	assertOwner: () => void,
) {
	const { state, endedAt, id, title, startedAt, segments } = recording;
	if (state === "recording" || endedAt === null || !segments.length) throw new Error("audio_unavailable");
	assertOwner();
	const meeting = await api.createMeeting({
		clientRecordingId: id,
		conversationId,
		title,
		...(recording.separateSpeakers ? { separateSpeakers: true } : {}),
		startedAt,
		endedAt,
		state,
		segments,
	});
	if (meeting.status !== "uploading") return meeting;
	for (const segment of meeting.segments) {
		if (segment.uploaded) continue;
		const bytes = await read(id, segment.index);
		assertOwner();
		await api.uploadMeetingSegment(meeting.id, segment.index, new Blob([new Uint8Array(bytes)]));
	}
	assertOwner();
	return await api.processMeeting(meeting.id);
}
