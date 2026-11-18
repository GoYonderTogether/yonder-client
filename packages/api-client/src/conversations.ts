import type {
	Attachment,
	AttachmentTextPreview,
	CompactConversationRequest,
	CompactConversationResponse,
	Conversation,
	MessagePage,
	SendMessageRequest,
	SendMessageResponse,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

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

		messages(conversationId: string, cursor?: string): Promise<MessagePage> {
			const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages${query}`);
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

		sendMessage(conversationId: string, body: SendMessageRequest): Promise<SendMessageResponse> {
			return client.request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
				body,
				idempotencyKey: body.clientNonce,
			});
		},

		uploadAttachment(file: File, clientNonce: string = crypto.randomUUID(), signal?: AbortSignal): Promise<Attachment> {
			const form = new FormData();
			form.set("file", file);
			form.set("clientNonce", clientNonce);
			return client.request("/v1/attachments", {
				raw: { bytes: form },
				idempotencyKey: clientNonce,
				...(signal ? { signal } : {}),
			});
		},

		attachmentContent(id: string): Promise<Blob> {
			return client.request(`/v1/attachments/${encodeURIComponent(id)}/content`, { responseType: "blob" });
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
