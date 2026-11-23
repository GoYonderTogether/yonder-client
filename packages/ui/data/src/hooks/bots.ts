/**
 * A Bot's lifecycle after creation: a new name, a new picture, or its end (15-Bot生命周期 三、五).
 * Every write lands in the caches the Bot appears in, so the list, the chat header and the group
 * roster change together without a refetch.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Member, UpdateBotRequest } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";
import { removeDirectConversationWith, removeMember, writeMember } from "../realtime/member-cache.ts";

/**
 * Which Bot receives visitors. It is a single owner setting that another device or window can
 * change, and the page shows it as the checked option, so a mount always reads it again rather
 * than trusting a value cached up to a minute ago.
 */
export function useReception() {
	const api = useApi();
	return useQuery({ queryKey: keys.reception(), queryFn: () => api.reception(), refetchOnMount: "always" });
}

export function useSetReception() {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: (botId: string | null) => api.setReception({ botId }),
		onSuccess: (setting) => {
			client.setQueryData(keys.reception(), setting);
			void client.invalidateQueries({ queryKey: ["member-profile"] });
		},
	});
}

/** `PATCH /v1/bots/:id`. The answer is the whole member, so it replaces every copy in place. */
export function useUpdateBot() {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({ id, ...body }: UpdateBotRequest & { id: string }) => api.updateBot(id, body),
		onSuccess: (member) => writeMember(client, member),
	});
}

/** `POST /v1/bots/:id/avatar`; the stored address comes back on the same member. */
export function useUploadBotAvatar() {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({ id, file }: { id: string; file: Blob }) => api.uploadBotAvatar(id, file),
		onSuccess: (member) => writeMember(client, member),
	});
}

/**
 * `DELETE /v1/bots/:id`. The server also publishes `conversation.removed` and `member.removed`, but
 * the answer to this request may arrive after them; both paths write the same end state.
 */
export function useDeleteBot() {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.deleteBot(id),
		onSuccess: (_result, id) => {
			void client.invalidateQueries({ queryKey: keys.reception() });
			removeDirectConversationWith(client, id);
			removeMember(client, id);
			void client.invalidateQueries({ queryKey: keys.schedules.all() });
		},
	});
}

/** The Bots this account owns, default first — the order 「我 › Bot」 shows (17 3.5). */
export function ownedBots(contacts: readonly Member[] | undefined, ownerId: string | undefined): Member[] {
	if (!ownerId || !contacts) return [];
	return contacts
		.filter((member) => member.kind === "bot" && member.ownerId === ownerId)
		.sort(
			(left, right) =>
				Number(right.isDefault) - Number(left.isDefault) || left.createdAt.localeCompare(right.createdAt),
		);
}
