import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GoalChange } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

export function useGoals() {
	const api = useApi();
	return useQuery({ queryKey: keys.goals(), queryFn: () => api.goals() });
}

export function useChangeGoal() {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({ id, ...change }: GoalChange & { id: string }) => api.changeGoal(id, change),
		onSuccess: () => client.invalidateQueries({ queryKey: keys.goals() }),
	});
}

/**
 * Deleting a goal ends the plans that work on it, so the schedule list is read again as well.
 * `remove` is the name the other lists use for the same thing.
 */
export function useRemoveGoal() {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.deleteGoal(id),
		onSuccess: () =>
			Promise.all([
				client.invalidateQueries({ queryKey: keys.goals() }),
				client.invalidateQueries({ queryKey: keys.schedules.all() }),
			]),
	});
}
