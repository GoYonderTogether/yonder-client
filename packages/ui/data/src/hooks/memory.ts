import { skipToken, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccountTimeZone } from "../preferences/account-preferences.ts";
import { keys } from "../query/keys.ts";
import { invalidateMemoryFiles } from "../query/memory-files.ts";
import { useApi } from "../query/provider.tsx";

/**
 * The memory timeline, newest day first; `fetchNextPage` loads older days.
 *
 * The server now cuts days by the account's own zone (stage 2, migration 127), so no `tz=` is sent:
 * in `manual` mode the server ignores it, and in `auto` it already has the device's report. The zone
 * stays in the key, so a change of zone refetches instead of showing days cut in the old one.
 */
export function useMemoryDays() {
	const api = useApi();
	const zone = useAccountTimeZone();
	return useInfiniteQuery({
		queryKey: keys.memory.daysInZone(zone),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) => api.memoryDays(pageParam),
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

/** Every folder the account has, each with the name the server gives it (D1, README 11-25 6.2). */
export function useMemoryFolders() {
	const api = useApi();
	return useQuery({ queryKey: keys.memory.folders(), queryFn: () => api.memoryFolders(), staleTime: 60_000 });
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
		release: useMutation({ mutationKey, mutationFn: api.updateMemoryFileProtection, onSuccess: refresh }),
		remove: useMutation({
			mutationKey,
			mutationFn: api.deleteMemoryFile,
			// The file is gone: refetching its open page would only answer 404 and unmount the page
			// before it can leave. Lists refresh now; the file's own queries are only marked stale.
			onSuccess: (_response, path) => invalidateMemoryFiles(client, [path], { deleted: true }),
		}),
		revert: useMutation({ mutationKey, mutationFn: api.revertMemoryFile, onSuccess: refresh }),
		// Both paths change: the file leaves the one it was under and joins the one it moves to.
		move: useMutation({
			mutationKey,
			mutationFn: api.moveMemoryFile,
			onSuccess: (_response, { from, to }) => invalidateMemoryFiles(client, [from, to]),
		}),
	};
}
