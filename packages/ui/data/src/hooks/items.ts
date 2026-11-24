import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ItemDetail, MeResponse, SendMessageRequest, UpdateItemRequest } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

/**
 * The items list (16-3 第八节): one merged, newest-first page over subtasks, schedule firings and
 * meeting processing. `botId` narrows it to one Bot's items; the page shows all of them.
 */
export function useItems(botId?: string | null, archived = false) {
	const api = useApi();
	return useInfiniteQuery({
		queryKey: archived ? keys.items.archived() : keys.items.list(botId ?? null),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			api.items(pageParam, { ...(botId ? { botId } : {}), ...(archived ? { archived } : {}) }),
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

/** The archived task sessions, newest first. Nothing is requested until `enabled`, so a folded section costs no call. */
export function useArchivedItems(enabled: boolean) {
	const api = useApi();
	return useInfiniteQuery({
		queryKey: keys.items.archived(),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) => api.items(pageParam, { archived: "only" }),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		enabled,
		staleTime: 15_000,
	});
}

type ItemListChange = { id: string; upcoming: boolean } & ({ patch: UpdateItemRequest } | { remove: true });

export function useItemListAction() {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: (change: ItemListChange) => {
			const { id, upcoming } = change;
			if ("remove" in change) return upcoming ? api.deleteUpcomingItem(id) : api.deleteItem(id);
			return upcoming ? api.updateUpcomingItem(id, change.patch) : api.updateItem(id, change.patch);
		},
		onMutate: () => client.getQueryData<MeResponse>(keys.me())?.member.id,
		onSuccess: async (_, { id, upcoming }, personId) => {
			if (client.getQueryData<MeResponse>(keys.me())?.member.id !== personId) return;
			await Promise.all([
				client.invalidateQueries({ queryKey: keys.items.lists() }),
				upcoming
					? client.invalidateQueries({ queryKey: keys.schedules.all() })
					: Promise.all([
							client.invalidateQueries({ queryKey: keys.items.detail(id) }),
							client.invalidateQueries({ queryKey: keys.items.session(id) }),
						]),
			]);
		},
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

export function useRenameItemSession(personId: string | undefined) {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({ id, title }: { id: string; title: string }) => api.renameItemSession(id, title),
		onSuccess: (session, { id }) => {
			if (client.getQueryData<MeResponse>(keys.me())?.member.id !== personId) return;
			client.setQueryData(keys.items.session(id), session);
			const title = session.conversation.title;
			if (title) client.setQueryData<ItemDetail>(keys.items.detail(id), (item) => item && { ...item, title });
			void client.invalidateQueries({ queryKey: keys.items.detail(id) });
			void client.invalidateQueries({ queryKey: keys.items.lists() });
			void client.invalidateQueries({ queryKey: keys.meetings.detail(id) });
		},
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
 * Stop a running subtask from the page: the same lifecycle the Bot already drives through
 * `task_manage`. Pausing, resuming and handing one to another Bot are the Bot's own tools now
 * (2026-11-24), told in chat. The list and the detail are both refetched.
 */
export function useItemActions() {
	const api = useApi();
	const client = useQueryClient();
	const refresh = () => client.invalidateQueries({ queryKey: keys.items.all() });
	return {
		cancel: useMutation({ mutationFn: (id: string) => api.cancelItem(id), onSuccess: refresh }),
	};
}
