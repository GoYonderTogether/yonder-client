import type {
	AnswerQuestionCardRequest,
	Attachment,
	AttachmentTextPreview,
	CompactConversationRequest,
	CompactConversationResponse,
	Conversation,
	Message,
	MessagePage,
	OutwardRequestAction,
	OutwardRequestCard,
	QuestionCardActionInput,
	QuestionCardActionResponse,
	ResetConversationResponse,
	SendMessageRequest,
	SendMessageResponse,
} from "@yonder/protocol";
import type { ApiClient, RequestOptions } from "./client.ts";

/** Conversations, messages, attachments and voice: what the chat view reads and sends. */
export function conversationEndpoints(client: ApiClient) {
	return {
		openVoiceSocket(): WebSocket {
			if (!client.accessToken) throw new Error("Missing access token");
			const url = new URL("/v1/audio/transcriptions/realtime", client.baseUrl || globalThis.location.origin);
			url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
			url.searchParams.set("token", client.accessToken);
			return new WebSocket(url);
		},

		conversations(): Promise<{ items: Conversation[] }> {
			return client.request("/v1/conversations");
		},

		messages(conversationId: string, cursor?: string, options?: { markRead?: boolean }): Promise<MessagePage> {
			const query = new URLSearchParams();
			if (cursor) query.set("cursor", cursor);
			if (options?.markRead === false) query.set("markRead", "false");
			const search = query.size ? `?${query.toString()}` : "";
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages${search}`);
		},

		markConversationRead(conversationId: string, messageId: string): Promise<{ ok: true }> {
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/read`, { body: { messageId } });
		},

		setConversationMuted(conversationId: string, muted: boolean): Promise<{ ok: true }> {
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/preferences`, {
				method: "PATCH",
				body: { muted },
			});
		},

		setConversationPinned(conversationId: string, pinned: boolean): Promise<{ ok: true }> {
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/preferences`, {
				method: "PATCH",
				body: { pinned },
			});
		},

		removeConversationFromMessages(conversationId: string): Promise<{ ok: true }> {
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
		},

		askOwner(messageId: string): Promise<OutwardRequestCard> {
			return client.request(`/v1/messages/${encodeURIComponent(messageId)}/ask-owner`, {
				body: {},
				idempotencyKey: messageId,
			});
		},

		actOnOutwardRequest(id: string, body: OutwardRequestAction): Promise<OutwardRequestCard> {
			return client.request(`/v1/outward-requests/${encodeURIComponent(id)}`, { body, idempotencyKey: id });
		},

		compactConversation(
			conversationId: string,
			body: CompactConversationRequest,
		): Promise<CompactConversationResponse> {
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/compact`, {
				body,
				idempotencyKey: body.clientNonce,
			});
		},

		resetConversation(conversationId: string, clearHistory: boolean): Promise<ResetConversationResponse> {
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/reset`, {
				body: { clearHistory },
			});
		},

		sendMessage(
			conversationId: string,
			body: SendMessageRequest,
			options: Pick<RequestOptions, "retried"> = {},
		): Promise<SendMessageResponse> {
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
				body,
				idempotencyKey: body.clientNonce,
				...options,
			});
		},

		recallMessage(messageId: string): Promise<Message> {
			return client.request(`/v1/messages/${encodeURIComponent(messageId)}/recall`, { method: "POST" });
		},

		deleteMessage(messageId: string): Promise<{ ok: true }> {
			return client.request(`/v1/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" });
		},

		messageFeedback(messageId: string, value: NonNullable<Message["feedback"]> | null): Promise<Message> {
			return client.request(`/v1/messages/${encodeURIComponent(messageId)}/feedback`, {
				method: "PUT",
				body: { value },
			});
		},

		forwardMessage(
			messageId: string,
			body: { conversationId: string; clientNonce: string },
		): Promise<SendMessageResponse> {
			return client.request(`/v1/messages/${encodeURIComponent(messageId)}/forward`, {
				body,
				idempotencyKey: body.clientNonce,
			});
		},

		questionCard(messageId: string): Promise<Message> {
			return client.request(`/v1/messages/${encodeURIComponent(messageId)}/question`);
		},

		answerQuestionCard(messageId: string, body: AnswerQuestionCardRequest): Promise<QuestionCardActionResponse> {
			return client.request(`/v1/messages/${encodeURIComponent(messageId)}/question`, {
				body,
				idempotencyKey: body.clientNonce,
			});
		},

		skipQuestionCard(messageId: string, body: QuestionCardActionInput): Promise<QuestionCardActionResponse> {
			return client.request(`/v1/messages/${encodeURIComponent(messageId)}/question`, {
				body: { ...body, action: "skip" },
				idempotencyKey: body.clientNonce,
			});
		},

		uploadAttachment(
			file: File,
			clientNonce: string = crypto.randomUUID(),
			signal?: AbortSignal,
			options: Pick<RequestOptions, "retried"> = {},
		): Promise<Attachment> {
			const form = new FormData();
			form.set("file", file);
			form.set("clientNonce", clientNonce);
			return client.request("/v1/attachments", {
				raw: { bytes: form },
				idempotencyKey: clientNonce,
				...(signal ? { signal } : {}),
				...options,
			});
		},

		attachmentContent(id: string): Promise<Blob> {
			return client.request(`/v1/attachments/${encodeURIComponent(id)}/content`, { responseType: "blob" });
		},

		attachmentDownload(id: string, variant: "thumb" | "original"): Promise<{ url: string | null }> {
			return client.request(`/v1/attachments/${encodeURIComponent(id)}/download?variant=${variant}`);
		},

		/** A bounded thumbnail prefix; never store it as the complete attachment Blob. */
		attachmentPrefix(id: string, maxBytes = 4096, signal?: AbortSignal): Promise<Blob> {
			if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 4096)
				throw new RangeError("attachment prefix must be 1–4096 bytes");
			return client.request(`/v1/attachments/${encodeURIComponent(id)}/content`, {
				responseType: "blob",
				range: `bytes=0-${maxBytes - 1}`,
				...(signal ? { signal } : {}),
			});
		},

		attachmentPreviewText(id: string, signal?: AbortSignal): Promise<AttachmentTextPreview> {
			return client.request(`/v1/attachments/${encodeURIComponent(id)}/preview`, { ...(signal ? { signal } : {}) });
		},

		previewAttachmentText(file: File, signal?: AbortSignal): Promise<AttachmentTextPreview> {
			const form = new FormData();
			form.set("file", file);
			return client.request("/v1/attachments/preview", { raw: { bytes: form }, ...(signal ? { signal } : {}) });
		},

		transcribeAudio(file: File, signal?: AbortSignal): Promise<{ text: string }> {
			const form = new FormData();
			form.set("file", file);
			return client.request("/v1/audio/transcriptions", { raw: { bytes: form }, ...(signal ? { signal } : {}) });
		},

		stopMessage(messageId: string): Promise<{ ok: true }> {
			return client.request(`/v1/messages/${encodeURIComponent(messageId)}/stop`, { body: {} });
		},

		retryMessage(messageId: string, idempotencyKey: string): Promise<SendMessageResponse> {
			return client.request(`/v1/messages/${encodeURIComponent(messageId)}/retry`, { body: {}, idempotencyKey });
		},
	};
}
