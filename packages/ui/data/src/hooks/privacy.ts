import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PrivacySettings } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

/** The three switches of 19 第四节; the server owns the defaults, so this never invents one. */
export function usePrivacy() {
	const api = useApi();
	return useQuery({ queryKey: keys.privacy(), queryFn: () => api.privacy(), staleTime: 60_000 });
}

/**
 * Each switch saves on its own and answers the whole settings object, which replaces the cache.
 * The caller reverts the switch it flipped if the mutation fails; nothing here guesses a value.
 */
export function useUpdatePrivacy() {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: (patch: Partial<PrivacySettings>) => api.updatePrivacy(patch),
		onSuccess: (settings) => client.setQueryData(keys.privacy(), settings),
	});
}
