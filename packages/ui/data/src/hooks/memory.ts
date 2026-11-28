import { skipToken, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@yonder/protocol";
import { useEffect } from "react";
import { keys } from "../query/keys.ts";
import { invalidateMemoryFiles } from "../query/memory-files.ts";
import { useApi } from "../query/provider.tsx";
import { deviceTimeZone, timelineSnapshot } from "../query/timeline-snapshot.ts";
import { chatCacheGeneration } from "../storage/chat-cache.ts";
import { discardMedia } from "../storage/media-cache.ts";

export { deviceTimeZone } from "../query/timeline-snapshot.ts";

/** The memory timeline, newest day first; `fetchNextPage` loads older days. */
export function useMemoryDays() {
	const api = useApi();
	const client = useQueryClient();
	const timeZone = deviceTimeZone();
	useEffect(() => {
		const queryKey = keys.memory.days();
		const cached = timelineSnapshot(client.getQueryData(queryKey));
		if (cached?.pages.some((page) => page.cacheTimeZone !== (timeZone ?? null)))
			void client.invalidateQueries({ queryKey }, { cancelRefetch: false });
	}, [client, timeZone]);
	return useInfiniteQuery({
		queryKey: keys.memory.days(),
		initialPageParam: undefined as string | undefined,
		queryFn: async ({ pageParam }) => ({
			...(await api.memoryDays(pageParam, timeZone)),
			cacheTimeZone: timeZone ?? null,
		}),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		staleTime: Infinity,
	});
}

export function useMemoryActions() {
	const api = useApi();
	const client = useQueryClient();
	return {
		remove: useMutation({
			mutationKey: keys.memory.all(),
			mutationFn: (id: string) => api.deleteMemory(id),
			onMutate: chatCacheGeneration,
			onSuccess: (_response, id, generation) => {
				if (generation !== chatCacheGeneration()) return;
				const queryKey = keys.memory.days();
				const owner = client.getQueryData<MeResponse>(keys.me())?.member.id;
				const cached = timelineSnapshot(client.getQueryData(queryKey));
				const entry = cached?.pages
					.flatMap((page) =>
						page.items.flatMap((day) =>
							day.blocks.flatMap((block) => (block.type === "entry" ? [block.entry] : block.stay.entries)),
						),
					)
					.find((entry) => entry.id === id);
				if (owner && entry) {
					const attachments = [...entry.media, ...entry.materials].flatMap(({ attachment }) =>
						attachment ? [{ attachmentId: attachment.id }] : [],
					);
					discardMedia(owner, attachments);
				}
				return client.invalidateQueries({ queryKey });
			},
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
