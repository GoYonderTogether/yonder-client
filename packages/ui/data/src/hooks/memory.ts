import { skipToken, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../query/keys.ts";
import { invalidateMemoryFiles } from "../query/memory-files.ts";
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
		remove: useMutation({
			mutationKey: keys.memory.all(),
			mutationFn: (id: string) => api.deleteMemory(id),
			onSuccess: refresh,
		}),
	};
}

export function useMemoryFiles(prefix = "") {
	const api = useApi();
	return useQuery({ queryKey: keys.memory.files(prefix), queryFn: () => api.memoryFiles(prefix || undefined) });
}

export function useMemoryFile(path?: string) {
	const api = useApi();
	return useQuery({ queryKey: keys.memory.file(path ?? ""), queryFn: path ? () => api.memoryFile(path) : skipToken });
}

export function useMemoryFileRevisions(path?: string) {
	const api = useApi();
	return useQuery({
		queryKey: keys.memory.revisions(path ?? ""),
		queryFn: path ? () => api.memoryFileRevisions(path) : skipToken,
	});
}

export function useMemoryFileActions() {
	const api = useApi();
	const client = useQueryClient();
	const mutationKey = keys.memory.all();
	const refresh = (_response: { ok: true }, { path }: { path: string }) => invalidateMemoryFiles(client, [path]);
	return {
		update: useMutation({ mutationKey, mutationFn: api.updateMemoryFile, onSuccess: refresh }),
		setVisibility: useMutation({ mutationKey, mutationFn: api.updateMemoryFileVisibility, onSuccess: refresh }),
		remove: useMutation({
			mutationKey,
			mutationFn: api.deleteMemoryFile,
			onSuccess: (_response, path) => invalidateMemoryFiles(client, [path]),
		}),
		revert: useMutation({ mutationKey, mutationFn: api.revertMemoryFile, onSuccess: refresh }),
	};
}
