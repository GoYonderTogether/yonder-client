import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

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
	return useQuery({
		queryKey: keys.meetings.detail(id ?? ""),
		queryFn: () => api.meeting(id ?? ""),
		enabled: Boolean(id),
		refetchOnWindowFocus: true,
		refetchInterval: (query) =>
			query.state.data && !["completed", "failed", "unknown"].includes(query.state.data.status) ? 2000 : false,
	});
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
