import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AddGroupMembersRequest, Conversation, TransferGroupOwnerRequest } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";
import { removeConversation, writeConversation } from "../realtime/member-cache.ts";
import { useMe } from "./account.ts";

/**
 * The group owner's calls, plus leaving (19 第三节). Every call that answers a conversation writes
 * it into the list cache in place, so the header, the member row and the list preview cannot
 * disagree; the reader is never asked to refetch what the server just sent.
 */
export function useGroupActions(conversationId: string) {
	const api = useApi();
	const client = useQueryClient();
	const personId = useMe().data?.member.id;

	const replace = (conversation: Conversation) => writeConversation(client, conversation);
	/** The server answers 204 for a removal; the member list is the only thing that changed. */
	const refetch = () => client.invalidateQueries({ queryKey: keys.conversations.list() });

	return {
		rename: useMutation({
			mutationFn: (title: string) => api.updateGroup(conversationId, { title }),
			onSuccess: replace,
		}),
		setBotPayer: useMutation({
			mutationFn: (groupBotPayer: "mentioner" | "owner") => api.updateGroup(conversationId, { groupBotPayer }),
			onSuccess: replace,
		}),
		addMembers: useMutation({
			mutationFn: (body: AddGroupMembersRequest) => api.addGroupMembers(conversationId, body),
			onSuccess: replace,
		}),
		removeMember: useMutation({
			mutationFn: (memberId: string) => api.removeGroupMember(conversationId, memberId),
			onSuccess: refetch,
		}),
		/** A leaver's group leaves their list; a removed member keeps a read-only copy instead. */
		leave: useMutation({
			mutationFn: async () => {
				if (!personId) throw new Error("no_session");
				await api.removeGroupMember(conversationId, personId);
			},
			onSuccess: () => removeConversation(client, conversationId),
		}),
		transferOwner: useMutation({
			mutationFn: (body: TransferGroupOwnerRequest) => api.transferGroupOwner(conversationId, body),
			onSuccess: replace,
		}),
		dissolve: useMutation({
			mutationFn: () => api.dissolveGroup(conversationId),
			onSuccess: replace,
		}),
	};
}
