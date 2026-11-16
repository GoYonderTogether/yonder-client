import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateScheduleRequest, UpdateScheduleRequest } from "@yonder/protocol";
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

export function useScheduleActions() {
	const api = useApi();
	const client = useQueryClient();
	const refresh = () => client.invalidateQueries({ queryKey: keys.schedules.all() });
	return {
		create: useMutation({
			mutationFn: (body: CreateScheduleRequest) => api.createSchedule(body),
			onSuccess: refresh,
		}),
		update: useMutation({
			mutationFn: ({ id, ...body }: UpdateScheduleRequest & { id: string }) => api.updateSchedule(id, body),
			onSuccess: refresh,
		}),
		pause: useMutation({ mutationFn: (id: string) => api.pauseSchedule(id), onSuccess: refresh }),
		resume: useMutation({ mutationFn: (id: string) => api.resumeSchedule(id), onSuccess: refresh }),
		remove: useMutation({ mutationFn: (id: string) => api.deleteSchedule(id), onSuccess: refresh }),
	};
}
