import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

/**
 * The items list (16-3 第八节): one merged, newest-first page over subtasks, schedule firings and
 * meeting processing. `botId` narrows it to one Bot's items; the page shows all of them.
 */
export function useItems(botId?: string | null) {
	const api = useApi();
	return useInfiniteQuery({
		queryKey: keys.items.list(botId ?? null),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) => api.items(pageParam, botId ? { botId } : {}),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		staleTime: 15_000,
		refetchOnWindowFocus: true,
	});
}

/** One item's detail: what was asked, what it produced, and the steps the source recorded. */
export function useItem(id: string | null) {
	const api = useApi();
	return useQuery({
		queryKey: keys.items.detail(id ?? ""),
		queryFn: () => api.item(id ?? ""),
		enabled: Boolean(id),
		staleTime: 10_000,
	});
}

/**
 * Cancel, pause and resume a subtask from the page: the same lifecycle the Bot already drives
 * through `task_manage`. The list and the detail are both refetched, because a pause takes effect
 * at the next step boundary — the answer is the state the record will reach, not the one it has now.
 */
export function useItemActions() {
	const api = useApi();
	const client = useQueryClient();
	const refresh = () => client.invalidateQueries({ queryKey: keys.items.all() });
	return {
		cancel: useMutation({ mutationFn: (id: string) => api.cancelItem(id), onSuccess: refresh }),
		pause: useMutation({ mutationFn: (id: string) => api.pauseItem(id), onSuccess: refresh }),
		resume: useMutation({ mutationFn: (id: string) => api.resumeItem(id), onSuccess: refresh }),
		transfer: useMutation({
			mutationFn: ({ id, botId }: { id: string; botId: string }) => api.transferItem(id, botId),
			onSuccess: refresh,
		}),
	};
}
