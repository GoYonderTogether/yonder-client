import type { MemberKind } from "../member/member.ts";

export interface ConversationMember {
	memberId: string;
	kind: MemberKind;
	handle: string;
	displayName: string;
	avatarUrl: string | null;
	avatarColor?: string | null;
}

export interface Conversation {
	id: string;
	kind: "direct" | "group";
	isPrimary?: boolean;
	title: string | null;
	members: ConversationMember[];
	lastMessageAt: string | null;
	lastMessage?: { body: string | null; senderKind: MemberKind; createdAt: string } | null;
	unreadCount: number;
	pinned: boolean;
	version: number;
}

export interface Run {
	id: string;
	conversationId: string;
	messageId: string;
	userMessageId: string;
	status: "queued" | "running" | "completed" | "failed" | "cancelled";
	failureReason?: string | null;
}

export interface Attachment {
	id: string;
	kind: "image" | "file" | "audio";
	name: string;
	mimeType: string;
	size: number;
}

export interface AttachmentTextPreview {
	kind: "text";
	format: "doc" | "docx" | "text";
	text: string;
	truncated: boolean;
}

export interface Message {
	id: string;
	conversationId: string;
	senderId: string;
	senderKind: MemberKind;
	type: "text";
	body: string | null;
	attachments: Attachment[];
	replyToId: string | null;
	createdAt: string;
	editedAt: string | null;
	streaming: boolean;
	version: number;
	clientNonce?: string | null;
	run?: Run | null;
}

export interface MessagePage {
	items: Message[];
	nextCursor: string | null;
	hasMore: boolean;
}

export interface SendMessageRequest {
	type: "text";
	body: string;
	attachmentIds?: string[];
	clientNonce: string;
	skillIds?: string[];
}

export interface SendMessageResponse {
	message: Message;
	clientNonce: string;
}

export interface CreateBotRequest {
	displayName: string;
	avatarColor?: string;
}

export interface CreateBotResponse {
	bot: import("../member/member.ts").Member;
	conversation: Conversation;
}

export interface AddContactResponse {
	contact: import("../member/member.ts").Member;
	conversation: Conversation;
}

export interface CreateGroupRequest {
	memberIds: string[];
	title?: string;
}
