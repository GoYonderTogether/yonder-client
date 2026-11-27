import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Conversation, CreateBotRequest, CreateGroupRequest, Member } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

export function useContacts() {
	const api = useApi();
	return useQuery({ queryKey: keys.contacts(), queryFn: () => api.contacts() });
}

export function useContactSearch(query: string) {
	const api = useApi();
	return useQuery({
		queryKey: keys.contactSearch(query),
		queryFn: () => api.searchContacts(query),
		enabled: Boolean(query),
		gcTime: 0,
	});
}

export function useContactActions() {
	const api = useApi();
	const client = useQueryClient();
	const save = (conversation: Conversation) => {
		client.setQueryData<{ items: Conversation[] }>(keys.conversations.list(), (current) => ({
			items: [conversation, ...(current?.items ?? []).filter((item) => item.id !== conversation.id)],
		}));
		void client.invalidateQueries({ queryKey: keys.contacts() });
	};
	return {
		createBot: useMutation({
			mutationFn: (body: CreateBotRequest) => api.createBot(body),
			onSuccess: ({ bot, conversation }) => {
				client.setQueryData<{ items: Member[] }>(keys.contacts(), (current) => {
					const items = current?.items ?? [];
					const existing = items.find((item) => item.id === bot.id);
					if (!existing) return { items: [...items, bot] };
					if (existing.version > bot.version) return current;
					return { items: items.map((item) => (item.id === bot.id ? bot : item)) };
				});
				save(conversation);
			},
		}),
		addContact: useMutation({
			mutationFn: (memberId: string) => api.addContact(memberId),
			onSuccess: ({ conversation }) => save(conversation),
		}),
		createGroup: useMutation({ mutationFn: (body: CreateGroupRequest) => api.createGroup(body), onSuccess: save }),
	};
}
