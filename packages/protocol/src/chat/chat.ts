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
	/** `task_notice` is a system event about a subtask, not a Bot reply. */
	type: "text" | "task_notice";
	body: string | null;
	attachments: Attachment[];
	replyToId: string | null;
	createdAt: string;
	editedAt: string | null;
	streaming: boolean;
	version: number;
	clientNonce?: string | null;
	/** Server-owned reference; opens the inline meeting capsule. */
	meeting?: { id: string; title: string };
	/** Present on a `task_notice`: which subtask it is about. */
	taskNotice?: { id: string; title: string; status: string };
	/** Present when a scheduled run could not happen: the plan and the real reason, shown as an error. */
	scheduleNotice?: { id: string; title: string; reason: string };
	/** Present when a parent run was refused a task for issuing too many in a burst; shown as an error. */
	burstNotice?: { reason: string };
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
