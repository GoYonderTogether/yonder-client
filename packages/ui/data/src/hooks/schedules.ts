import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

/** The scheduled-task list. A plan changes on its own schedule, so the page also refetches on focus. */
export function useSchedules() {
	const api = useApi();
	return useQuery({
		queryKey: keys.schedules.list(),
		queryFn: () => api.schedules(),
		staleTime: 15_000,
		refetchOnWindowFocus: true,
	});
}

/**
 * What the 定时任务 side panel can do: delete a plan. Creating one, changing it, and pausing or
 * resuming it are the Bot's own tools now (2026-11-24), told in chat.
 */
export function useScheduleActions() {
	const api = useApi();
	const client = useQueryClient();
	const refresh = () => client.invalidateQueries({ queryKey: keys.schedules.all() });
	return {
		remove: useMutation({ mutationFn: (id: string) => api.deleteSchedule(id), onSuccess: refresh }),
	};
}
