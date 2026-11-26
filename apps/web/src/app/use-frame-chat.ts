import { visitRelayTarget } from "@yonder/chat-model";
import type { Attachment, Conversation, SendMessageRequest } from "@yonder/protocol";
import {
	outboxCacheKey,
	readChatCache,
	useCompactConversation,
	useCreateItem,
	useItemSession,
	useMessages,
	useSendMessage,
} from "@yonder/ui-data";
import { type ChatVoice, voiceDuration, voiceFiles } from "../lib/chat-voice.ts";
import { isDesktopExperience } from "../lib/platform.ts";
import { draftFile, useChatDraft } from "./use-chat-draft.ts";
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

	const knownVoiceNonce = (nonce: string) =>
		history.data?.pages.some((page) => page.items.some((message) => message.clientNonce === nonce)) ?? false;

	async function sendToTarget(input: SendMessageRequest & { attachments: Attachment[] }) {
		if (!creating) return void (await send.mutateAsync(input));
		const { attachments: _attachments, ...body } = input;
		const result = await create.mutateAsync(body);
		onCreated(result.item.id);
	}

	async function submit() {
		if (!creating && !target) return;
		let createdId: string | undefined;
		const sent = await draft.submit(async (input) => {
			if (!creating) return send.mutateAsync(input);
			const { attachments: _attachments, ...body } = input;
			const result = await create.mutateAsync(body);
			createdId = result.item.id;
		});
		if (sent && createdId) onCreated(createdId);
	}

	async function submitVoice(recording: ChatVoice, signal: AbortSignal) {
		if (!creating && !target) throw new Error("voice_conversation_missing");
		const attachments: Attachment[] = [];
		for (const [index, file] of voiceFiles(recording, 240_000).entries()) {
			signal.throwIfAborted();
			const { attachment } = await draft.uploadDirectFile(
				{ ...draftFile(file), id: `${recording.nonce}:${index}` },
				signal,
			);
			attachments.push(attachment);
		}
		signal.throwIfAborted();
		try {
			await sendToTarget({
				type: "voice",
				body: "",
				clientNonce: recording.nonce,
				attachmentIds: attachments.map(({ id }) => id),
				attachments,
				voice: { durationMs: voiceDuration(recording), ...(hasBot ? { transcribe: true } : {}) },
			});
		} catch (error) {
			// After upload, let the timeline own retries if its message already survived to the outbox.
			const queued = personId && target && (await readChatCache(outboxCacheKey(personId, target.id, recording.nonce)));
			if (!queued) throw error;
		}
	}

	return {
		draft,
		scope,
		target,
		hasBot,
		itemSession,
		submit,
		submitVoice,
		knownVoiceNonce,
		compact,
		directAttachments,
		visitRelay:
			target?.visit?.role === "visitor" && target.visit.state !== "denied"
				? {
						conversationId: target.id,
						...visitRelayTarget(history.data?.pages.toReversed().flatMap((page) => page.items) ?? [], personId),
					}
				: undefined,
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
