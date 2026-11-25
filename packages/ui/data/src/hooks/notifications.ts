/**
 * The account's notification setting (`yonder/docs/notifications.md` 第三节): how much of a message
 * a push may show. The server reads the same row when it builds a push, so the setting is applied
 * once, where the notification is made, and every client shows what it is given.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationPreferences, UpdateNotificationPreferencesRequest } from "@yonder/protocol";
import { useSessionStore } from "../auth/session-store.ts";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

export function useNotificationPreferences() {
	const api = useApi();
	const signedIn = useSessionStore((state) => state.status === "signed-in");
	return useQuery({
		queryKey: keys.notifications(),
		queryFn: ({ signal }) => api.notificationPreferences(signal),
		enabled: signedIn,
		staleTime: 5 * 60_000,
	});
}

export function useUpdateNotificationPreferences() {
	const api = useApi();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: UpdateNotificationPreferencesRequest) => api.updateNotificationPreferences(body),
		onMutate: async (body) => {
			await queryClient.cancelQueries({ queryKey: keys.notifications() });
			const previous = queryClient.getQueryData<NotificationPreferences>(keys.notifications());
			if (previous) queryClient.setQueryData<NotificationPreferences>(keys.notifications(), { ...previous, ...body });
			return { previous };
		},
		onError: (_error, _body, context) => {
			if (context?.previous) queryClient.setQueryData(keys.notifications(), context.previous);
		},
		onSuccess: (next) => queryClient.setQueryData(keys.notifications(), next),
	});
}
