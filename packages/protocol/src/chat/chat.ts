import type { MemberKind } from "../member/member.ts";

export interface ConversationMember {
	memberId: string;
	kind: MemberKind;
	handle: string;
	displayName: string;
	avatarUrl: string | null;
}

export interface Conversation {
	id: string;
	kind: "direct" | "group";
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

export interface Message {
	id: string;
	conversationId: string;
	senderId: string;
	senderKind: MemberKind;
	type: "text";
	body: string | null;
	attachments: unknown[];
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
	clientNonce: string;
}

export interface SendMessageResponse {
	message: Message;
	clientNonce: string;
}
