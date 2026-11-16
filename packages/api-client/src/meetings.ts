import type { CreateMeetingRequest, MeetingRecord, RetryMeetingRequest } from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

export function meetingEndpoints(client: ApiClient) {
	return {
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
		meetingAudio(id: string, index: number): Promise<Blob> {
			return client.request(`/v1/meetings/${encodeURIComponent(id)}/segments/${index}/content`, {
				responseType: "blob",
			});
		},
		deleteMeeting(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/meetings/${encodeURIComponent(id)}`, { method: "DELETE" });
		},
	};
}
