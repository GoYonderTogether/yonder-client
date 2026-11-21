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
		},
	});
	return { edit, busy };
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
