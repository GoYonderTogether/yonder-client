import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SocialLibraryChange } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

export function useSocialLibrary() {
	const api = useApi();
	return useQuery({ queryKey: keys.socialLibrary(), queryFn: () => api.socialLibrary(), staleTime: 0 });
}

export function useEditSocialLibrary() {
	const api = useApi();
	const client = useQueryClient();
	const queryKey = keys.socialLibrary();
	const busy = useIsMutating({ mutationKey: queryKey }) > 0;
	const edit = useMutation({
		mutationKey: queryKey,
		scope: { id: queryKey[0] },
		mutationFn: (change: SocialLibraryChange) => api.editSocialLibrary(change),
		onSuccess: async (value) => {
			await client.cancelQueries({ queryKey });
			client.setQueryData(queryKey, value);
			void client.invalidateQueries({
				queryKey: keys.memory.all(),
				predicate: ({ queryKey }) => queryKey[1] === "file" || queryKey[1] === "file-list",
			});
		},
	});
	return { edit, busy };
}

export function useMemoryOrganization(waiting = false) {
	const api = useApi();
	return useQuery({
		queryKey: keys.memory.organization(),
		queryFn: () => api.memoryOrganization(),
		refetchInterval: ({ state }) => (waiting && !state.data?.plan ? 2500 : false),
		staleTime: 0,
	});
}

export function useReviewMemoryOrganization() {
	const api = useApi();
	const client = useQueryClient();
	const queryKey = keys.memory.organization();
	return useMutation({
		mutationKey: queryKey,
		mutationFn: api.reviewMemoryOrganization,
		onSuccess: async (value, input) => {
			await client.cancelQueries({ queryKey });
			client.setQueryData(queryKey, value);
			if (input.moves.length === 0) return;
			void client.invalidateQueries({
				queryKey: keys.memory.all(),
				predicate: ({ queryKey }) => ["file", "file-list", "social-library"].includes(String(queryKey[1])),
			});
		},
	});
}

export function useSocialPersona(botId: string) {
	const api = useApi();
	return useQuery({ queryKey: keys.socialPersona(botId), queryFn: () => api.botSocial(botId) });
}

export function useSaveSocialPersona(botId: string) {
	const api = useApi();
	const client = useQueryClient();
	const queryKey = keys.socialPersona(botId);
	return useMutation({
		scope: { id: `${queryKey[0]}:${botId}` },
		mutationFn: (content: string) => api.saveBotSocial(botId, content),
		onSuccess: async (value) => {
			await client.cancelQueries({ queryKey });
			client.setQueryData(queryKey, value);
		},
	});
}
