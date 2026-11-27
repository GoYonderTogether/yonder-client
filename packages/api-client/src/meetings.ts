import type {
	CreateMeetingRequest,
	FinalizeLiveMeetingRequest,
	LiveMeetingCaptureState,
	LiveMeetingProgress,
	MeetingRecord,
	RetryMeetingRequest,
	StartLiveMeetingRequest,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

export function meetingEndpoints(client: ApiClient) {
	return {
		startLiveMeeting(body: StartLiveMeetingRequest, signal: AbortSignal): Promise<LiveMeetingProgress> {
			return client.request("/v1/meetings/live", { body, signal, idempotencyKey: body.clientRecordingId });
		},
		liveMeeting(id: string, signal: AbortSignal): Promise<LiveMeetingProgress> {
			return client.request(`/v1/meetings/${encodeURIComponent(id)}/live`, { signal });
		},
		checkpointLiveMeeting(
			id: string,
			captureState: LiveMeetingCaptureState,
			signal: AbortSignal,
		): Promise<LiveMeetingProgress> {
			return client.request(`/v1/meetings/${encodeURIComponent(id)}/live/cursor`, { body: { captureState }, signal });
		},
		uploadLiveMeetingSegment(
			id: string,
			index: number,
			bytes: Blob,
			signal: AbortSignal,
		): Promise<LiveMeetingProgress> {
			return client.request(`/v1/meetings/${encodeURIComponent(id)}/live/segments/${index}`, {
				raw: { bytes, contentType: "audio/wav" },
				signal,
			});
		},
		uploadMeetingLivePhoto(
			id: string,
			photoId: string,
			elapsedMs: number,
			image: Blob,
			signal: AbortSignal,
		): Promise<unknown> {
			return client.request(
				`/v1/meetings/${encodeURIComponent(id)}/live/photos/${encodeURIComponent(photoId)}?elapsedMs=${elapsedMs}`,
				{
					raw: { bytes: image, contentType: "image/jpeg" },
					signal,
				},
			);
		},
		finalizeLiveMeeting(id: string, body: FinalizeLiveMeetingRequest, signal: AbortSignal): Promise<MeetingRecord> {
			return client.request(`/v1/meetings/${encodeURIComponent(id)}/live/finalize`, { body, signal });
		},
		createMeeting(body: CreateMeetingRequest): Promise<MeetingRecord> {
			return client.request("/v1/meetings", { body, idempotencyKey: body.clientRecordingId });
		},
		meetings(conversationId: string): Promise<{ items: MeetingRecord[] }> {
			return client.request(`/v1/meetings?conversationId=${encodeURIComponent(conversationId)}`);
		},
		meeting(id: string): Promise<MeetingRecord> {
			return client.request(`/v1/meetings/${encodeURIComponent(id)}`);
		},
		uploadMeetingSegment(id: string, index: number, bytes: Blob, signal?: AbortSignal): Promise<MeetingRecord> {
			return client.request(`/v1/meetings/${encodeURIComponent(id)}/segments/${index}`, {
				raw: { bytes, contentType: "audio/wav" },
				...(signal ? { signal } : {}),
			});
		},
		processMeeting(id: string): Promise<MeetingRecord> {
			return client.request(`/v1/meetings/${encodeURIComponent(id)}/process`, { body: {} });
		},
		retryMeeting(id: string, body: RetryMeetingRequest = {}): Promise<MeetingRecord> {
			return client.request(`/v1/meetings/${encodeURIComponent(id)}/retry`, { body });
		},
		meetingAudio(id: string, index: number, signal?: AbortSignal): Promise<Blob> {
			return client.request(`/v1/meetings/${encodeURIComponent(id)}/segments/${index}/content`, {
				responseType: "blob",
				...(signal ? { signal } : {}),
			});
		},
		meetingPhoto(id: string, photoId: string, signal: AbortSignal): Promise<Blob> {
			return client.request(
				`/v1/meetings/${encodeURIComponent(id)}/live/photos/${encodeURIComponent(photoId)}/content`,
				{ responseType: "blob", signal },
			);
		},
		deleteMeeting(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/meetings/${encodeURIComponent(id)}`, { method: "DELETE" });
		},
	};
}
