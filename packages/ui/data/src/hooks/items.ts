import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse, SendMessageRequest } from "@yonder/protocol";
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
		refetchInterval: (query) =>
			query.state.data?.pages.some((page) =>
				page.items.some(
					(item) => (item.source === "conversation" || item.source === "meeting") && item.state === "running",
				),
			)
				? 3000
				: false,
	});
}

export function useActiveBotSubtasks(botId: string | undefined) {
	const api = useApi();
	return useQuery({
		queryKey: keys.items.activeSubtasks(botId ?? ""),
		queryFn: ({ signal }) => api.activeBotSubtasks(botId ?? "", signal),
		enabled: Boolean(botId),
		staleTime: 0,
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
		refetchInterval: (query) => (query.state.data?.state === "running" ? 3000 : false),
	});
}

export function useItemSession(id: string | null) {
	const api = useApi();
	return useQuery({
		queryKey: keys.items.session(id ?? ""),
		queryFn: () => api.openItemSession(id ?? ""),
		enabled: Boolean(id),
		staleTime: 60_000,
	});
}

export function useCreateItem(personId: string | undefined) {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: (input: SendMessageRequest) => api.createItem(input),
		onSuccess: ({ item, conversation }) => {
			if (client.getQueryData<MeResponse>(keys.me())?.member.id !== personId) return;
			client.setQueryData(keys.items.session(item.id), { conversation });
			void client.invalidateQueries({ queryKey: keys.items.lists() });
		},
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
