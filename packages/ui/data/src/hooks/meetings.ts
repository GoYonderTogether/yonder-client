import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@yonder/api-client";
import type { MeetingRecord, MeResponse } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";
import { chatCacheGeneration } from "../storage/chat-cache.ts";
import { discardMedia } from "../storage/media-cache.ts";

export function useMeetings(conversationId: string | null, options: { enabled: boolean; uploading: boolean }) {
	const api = useApi();
	return useQuery({
		queryKey: keys.meetings.list(conversationId ?? ""),
		queryFn: () => api.meetings(conversationId ?? ""),
		enabled: Boolean(conversationId) && options.enabled,
		refetchOnWindowFocus: true,
		refetchInterval: (query) =>
			query.state.status !== "error" &&
			(options.uploading ||
				query.state.data?.items.some((item) => !["completed", "failed", "unknown"].includes(item.status)))
				? 2000
				: false,
	});
}

export function useMeeting(id: string | null) {
	const api = useApi();
	const client = useQueryClient();
	const queryKey = keys.meetings.detail(id ?? "");
	return useQuery({
		queryKey,
		queryFn: async () => {
			const owner = client.getQueryData<MeResponse>(keys.me())?.member.id;
			const previous = client.getQueryData<MeetingRecord>(queryKey);
			const generation = chatCacheGeneration();
			try {
				const meeting = await api.meeting(id ?? "");
				if (
					owner &&
					generation === chatCacheGeneration() &&
					meeting.audioRetained === false &&
					previous?.audioRetained !== false
				)
					discardMedia(
						owner,
						meeting.segments.map(({ index }) => ({ meetingId: meeting.id, segmentIndex: index })),
					);
				return meeting;
			} catch (error) {
				if (owner && previous && generation === chatCacheGeneration() && meetingAccessLost(error)) {
					discardMedia(owner, [
						...previous.segments.map(({ index }) => ({ meetingId: previous.id, segmentIndex: index })),
						...(previous.photos ?? []).map(({ clientPhotoId }) => ({ meetingId: previous.id, photoId: clientPhotoId })),
					]);
				}
				throw error;
			}
		},
		enabled: Boolean(id),
		// Cached raw evidence may get backfilled after a link to a later batch was shared.
		staleTime: 0,
		refetchOnWindowFocus: true,
		refetchInterval: (query) =>
			query.state.data && !["completed", "failed", "unknown"].includes(query.state.data.status) ? 2000 : false,
	});
}

export function meetingAccessLost(error: unknown): boolean {
	return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

export function useMeetingActions() {
	const api = useApi();
	const client = useQueryClient();
	return {
		retry: useMutation({
			mutationFn: ({ id, confirmUnknown }: { id: string; confirmUnknown: boolean }) =>
				api.retryMeeting(id, { confirmUnknown }),
			onSuccess: async (record) => {
				client.setQueryData(keys.meetings.detail(record.id), record);
				await client.invalidateQueries({ queryKey: keys.meetings.all() });
			},
		}),
	};
}
