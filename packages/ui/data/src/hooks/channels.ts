import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChannelAttempt, ChannelConversationAction } from "@yonder/protocol";
import { useEffect, useState } from "react";
import { useApi } from "../query/provider.tsx";
import { usePerson } from "./account.ts";

export function useChannels() {
	const api = useApi();
	const ownerId = usePerson()?.id;
	return useQuery({
		queryKey: ["channels", ownerId],
		queryFn: () => api.channels(),
		enabled: Boolean(ownerId),
		refetchInterval: 5000,
	});
}

export function useChannelActions() {
	const api = useApi();
	const query = useQueryClient();
	const refresh = () => void query.invalidateQueries({ queryKey: ["channels"] });
	return {
		start: useMutation({ mutationFn: api.startChannel }),
		startWechat: useMutation({ mutationFn: api.startWechat }),
		cancel: useMutation({ mutationFn: api.cancelChannelAttempt }),
		toggle: useMutation({
			mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.enableChannel(id, enabled),
			onSuccess: refresh,
		}),
		disconnect: useMutation({ mutationFn: api.disconnectChannel, onSuccess: refresh }),
		admission: useMutation({
			mutationFn: ({ id, ...policy }: { id: string; allowExternalDm: boolean; allowGroups: boolean }) =>
				api.setChannelAdmission(id, policy),
			onSuccess: refresh,
		}),
	};
}

export function useChannelConversations(connectionId: string) {
	const api = useApi();
	const query = useQueryClient();
	const ownerId = usePerson()?.id;
	const queryKey = ["channel-conversations", ownerId, connectionId];
	const list = useQuery({
		queryKey,
		queryFn: () => api.externalChannelConversations(connectionId),
		enabled: Boolean(ownerId),
		refetchInterval: 4000,
	});
	const change = useMutation({
		mutationFn: ({ id, action }: { id: string; action: ChannelConversationAction }) =>
			api.setChannelConversation(id, action),
		onSuccess: () => void query.invalidateQueries({ queryKey }),
	});
	return { list, change };
}

export function useChannelMessages(id: string) {
	const api = useApi();
	const ownerId = usePerson()?.id;
	return useInfiniteQuery({
		queryKey: ["channel-messages", ownerId, id],
		queryFn: ({ pageParam }) => api.externalChannelMessages(id, pageParam ?? undefined),
		initialPageParam: null as string | null,
		getNextPageParam: (last) => last.before,
		enabled: Boolean(ownerId),
		refetchInterval: 4000,
	});
}

/** Authorization links are held only in mounted memory, outside the persistent query cache. */
export function useChannelAttempt(id: string) {
	const api = useApi();
	const query = useQueryClient();
	const ownerId = usePerson()?.id;
	const [result, setResult] = useState<{ id: string; ownerId: string; attempt?: ChannelAttempt; error?: boolean }>();
	useEffect(() => {
		if (!ownerId) return;
		const owner = ownerId;
		let disposed = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		async function poll() {
			try {
				const attempt = await api.channelAttempt(id);
				if (disposed) return;
				setResult({ id, ownerId: owner, attempt });
				if (!["awaiting", "connecting"].includes(attempt.state)) {
					void query.invalidateQueries({ queryKey: ["channels", owner] });
					return;
				}
			} catch {
				if (disposed) return;
				setResult({ id, ownerId: owner, error: true });
			}
			timer = setTimeout(() => void poll(), 1500);
		}
		void poll();
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, [api, id, ownerId, query]);
	return result?.id === id && result.ownerId === ownerId ? result : undefined;
}
