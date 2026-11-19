import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

export function useSocialKnowledge() {
	const api = useApi();
	return useQuery({ queryKey: keys.socialKnowledge(), queryFn: () => api.socialKnowledge() });
}

export function useEditSocialKnowledge() {
	const api = useApi();
	const client = useQueryClient();
	const queryKey = keys.socialKnowledge();
	const busy = useIsMutating({ mutationKey: queryKey }) > 0;
	const edit = useMutation({
		mutationKey: queryKey,
		scope: { id: queryKey[0] },
		mutationFn: (change: { content: string } | { id: string; approve: boolean }) =>
			"content" in change ? api.saveSocialKnowledge(change.content) : api.socialDraft(change.id, change.approve),
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
