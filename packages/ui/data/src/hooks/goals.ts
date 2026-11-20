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

export function useGoalSettings() {
	const api = useApi();
	const client = useQueryClient();
	return {
		transfer: useMutation({
			mutationFn: ({ id, botId }: { id: string; botId: string }) => api.transferGoal(id, botId),
			onSuccess: () => client.invalidateQueries({ queryKey: keys.goals() }),
		}),
	};
}
