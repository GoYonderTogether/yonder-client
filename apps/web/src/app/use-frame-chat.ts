import type { Conversation } from "@yonder/protocol";
import { useCompactConversation, useCreateItem, useItemSession, useMessages, useSendMessage } from "@yonder/ui-data";
import { isDesktopExperience } from "../lib/platform.ts";
import { useChatDraft } from "./use-chat-draft.ts";
import { useDirectAttachmentSend } from "./use-direct-attachment-send.ts";

export function useFrameChat({
	personId,
	conversation,
	task,
	onCreated,
}: {
	personId: string | undefined;
	conversation: Conversation | undefined;
	task: string | null;
	onCreated: (id: string) => void;
}) {
	const creating = task === "new";
	const itemSession = useItemSession(task && !creating ? task : null);
	const target = task ? itemSession.data?.conversation : conversation;
	const scope = creating ? "new-item" : target?.id;
	const draft = useChatDraft(personId, scope);
	const history = useMessages(target?.id ?? null);
	const send = useSendMessage(target?.id ?? null, personId);
	const directAttachments = useDirectAttachmentSend({
		owner: isDesktopExperience() ? undefined : personId,
		conversation: target?.id,
		uploadFile: draft.uploadDirectFile,
		send: send.mutateAsync,
		knownNonce: (nonce) =>
			history.data?.pages.some((page) => page.items.some((message) => message.clientNonce === nonce)) ?? false,
	});
	const create = useCreateItem(personId);
	const compact = useCompactConversation(target?.id);
	const streaming = history.data?.pages
		.flatMap((page) => page.items)
		.findLast((message) => message.senderKind === "bot" && message.streaming && !message.questionCard);
	const hasBot = creating || (target?.members.some((member) => member.kind === "bot") ?? false);

	async function submit(voice?: File) {
		if (!creating && !target) return;
		let createdId: string | undefined;
		const sent = await draft.submit(
			async (input) => {
				if (!creating) return send.mutateAsync(input);
				const { attachments: _attachments, ...body } = input;
				const result = await create.mutateAsync(body);
				createdId = result.item.id;
			},
			voice ? { file: voice, transcribe: hasBot } : undefined,
		);
		if (sent && createdId) onCreated(createdId);
	}

	return {
		draft,
		scope,
		target,
		hasBot,
		itemSession,
		submit,
		compact,
		directAttachments,
		streaming: Boolean(streaming),
		blocked:
			(!target && !creating) ||
			!personId ||
			!draft.loaded ||
			history.isLoading ||
			history.isError ||
			draft.sending ||
			directAttachments.sending ||
			!directAttachments.ready ||
			send.isPending ||
			create.isPending,
	};
}
