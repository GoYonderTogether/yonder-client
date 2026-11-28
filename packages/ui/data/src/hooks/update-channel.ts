import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@yonder/api-client";
import { useData } from "../query/provider.tsx";

export type ReleaseChannel = "stable" | "beta";
export type UpdateChannel = { betaEnabled: boolean; channel: ReleaseChannel };

const PATH = "/v1/me/update-channel";
const STABLE: UpdateChannel = { betaEnabled: false, channel: "stable" };

function readChannel(value: unknown): UpdateChannel {
	const data = value as Partial<UpdateChannel> | null;
	if (data?.betaEnabled !== true) return STABLE;
	return { betaEnabled: true, channel: data.channel === "beta" ? "beta" : "stable" };
}

export function useUpdateChannel(owner: string | undefined, activePreview: boolean) {
	const { client } = useData();
	const cache = useQueryClient();
	const queryKey = ["update-channel", owner] as const;
	const state = useQuery<UpdateChannel>({
		queryKey,
		enabled: !!owner,
		staleTime: 0,
		refetchOnWindowFocus: true,
		refetchInterval: (query) => (activePreview || query.state.data?.betaEnabled ? 30_000 : false),
		queryFn: async ({ signal }) => {
			try {
				return readChannel(await client.request<unknown>(PATH, { signal }));
			} catch (error) {
				if (error instanceof ApiError && error.status === 404) return STABLE;
				throw error;
			}
		},
	});
	const change = useMutation({
		mutationKey: queryKey,
		onMutate: async () => cache.cancelQueries({ queryKey }),
		mutationFn: async (channel: ReleaseChannel) =>
			readChannel(await client.request<unknown>(PATH, { method: "PUT", body: { channel } })),
		onSuccess: (value) => cache.setQueryData(queryKey, value),
		onError: () => cache.invalidateQueries({ queryKey }),
	});
	return { state, change };
}
