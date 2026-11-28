import { conversationPeer, visitRelayTarget } from "@yonder/chat-model";
import type { Attachment, Conversation, SendMessageRequest } from "@yonder/protocol";
import { useCompactConversation, useCreateItem, useItemSession, useMessages, useSendMessage } from "@yonder/ui-data";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { type ChatVoice, voiceDuration, voiceFiles } from "../lib/chat-voice.ts";
import { isDesktopExperience } from "../lib/platform.ts";
import { conversationTitle } from "../pages/conversation-presentation.tsx";
import { quoteInput } from "./composer-quote.tsx";
import { draftFile, outgoingFile } from "./draft-file.ts";
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
	const editorRef = useRef<HTMLTextAreaElement>(null);
	const [imageDrop, setImageDrop] = useState<{ personId: string; conversationId: string; files: File[] }>();
	const addDroppedImages = useEffectEvent((files: File[]) => {
		draft.addFiles(files);
		const editor = editorRef.current;
		if (!editor) return;
		editor.focus({ preventScroll: true });
		editor.setSelectionRange(editor.value.length, editor.value.length);
	});
	useEffect(() => {
		if (!imageDrop) return;
		if (imageDrop.personId !== personId) setImageDrop(undefined);
		else if (imageDrop.conversationId === scope && draft.loaded) {
			setImageDrop(undefined);
			addDroppedImages(imageDrop.files);
		}
	}, [imageDrop, personId, scope, draft.loaded]);
	const history = useMessages(target?.id ?? null);
	const send = useSendMessage(target?.id ?? null, personId);
	const directAttachments = useDirectAttachmentSend({
		owner: isDesktopExperience() ? undefined : personId,
		conversation: target?.id,
		send: send.enqueue,
		quote: draft.quote,
		onQuotedSend: (id) => draft.setQuote(undefined, id),
		knownNonce: (nonce) =>
			history.data?.pages.some((page) => page.items.some((message) => message.clientNonce === nonce)) ?? false,
	});
	const create = useCreateItem(personId);
	const compact = useCompactConversation(target?.id);
	const hasBot = creating || (target?.members.some((member) => member.kind === "bot") ?? false);

	const knownVoiceNonce = (nonce: string) =>
		history.data?.pages.some((page) => page.items.some((message) => message.clientNonce === nonce)) ?? false;

	async function submit() {
		if (!creating && !target) return;
		let createdId: string | undefined;
		const sent = await draft.submit(
			async (input) => {
				if (!creating) return send.enqueue(input);
				const { attachments: _attachments, files: _files, replyTo: _replyTo, ...body } = input;
				const result = await create.mutateAsync(body);
				createdId = result.item.id;
			},
			undefined,
			!creating,
		);
		if (sent && createdId) onCreated(createdId);
	}

	async function submitVoice(recording: ChatVoice, signal: AbortSignal) {
		if (!creating && !target) throw new Error("voice_conversation_missing");
		const files = voiceFiles(recording, 240_000).map((file, index) => ({
			...draftFile(file),
			id: `${recording.nonce}:${index}`,
		}));
		const voice: SendMessageRequest = {
			type: "voice",
			body: "",
			clientNonce: recording.nonce,
			voice: { durationMs: voiceDuration(recording), ...(hasBot ? { transcribe: true } : {}) },
		};
		signal.throwIfAborted();
		if (creating) {
			const attachments: Attachment[] = [];
			for (const file of files) {
				signal.throwIfAborted();
				attachments.push((await draft.uploadDirectFile(file, signal)).attachment);
			}
			signal.throwIfAborted();
			const result = await create.mutateAsync({ ...voice, attachmentIds: attachments.map(({ id }) => id) });
			onCreated(result.item.id);
		} else {
			await send.enqueue({ ...voice, ...quoteInput(draft.quote), files: files.map(outgoingFile) });
		}
		if (draft.quote) draft.setQuote(undefined, draft.quote.replyTo.id);
	}

	return {
		draft,
		editorRef,
		queueImageDrop: (drop: { conversationId: string; files: File[] }) => {
			if (personId) setImageDrop({ ...drop, personId });
		},
		quote: {
			conversationId: draft.loaded && !target?.closedReason && target?.visit?.role !== "host" ? target?.id : undefined,
			quote: draft.quote,
			setQuote: draft.setQuote,
		},
		recipientName: task
			? target && conversationPeer(target, personId)?.displayName
			: conversation && conversationTitle(conversation, personId),
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
		blocked:
			(!target && !creating) ||
			Boolean(target?.closedReason) ||
			!personId ||
			!draft.loaded ||
			draft.sending ||
			create.isPending,
	};
}
