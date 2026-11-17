import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

/**
 * The device's IANA zone. It decides which calendar day an event belongs to, and the server keeps
 * it on the account, so every page request carries it.
 */
export function deviceTimeZone(): string | undefined {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
	} catch {
		return undefined;
	}
}

/** The memory timeline, newest day first; `fetchNextPage` loads older days. */
export function useMemoryDays() {
	const api = useApi();
	return useInfiniteQuery({
		queryKey: keys.memory.days(),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) => api.memoryDays(pageParam, deviceTimeZone()),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		staleTime: 60_000,
	});
}

export function useMemoryActions() {
	const api = useApi();
	const client = useQueryClient();
	const refresh = () => client.invalidateQueries({ queryKey: keys.memory.days() });
	return {
		remove: useMutation({ mutationFn: (id: string) => api.deleteMemory(id), onSuccess: refresh }),
	};
}
