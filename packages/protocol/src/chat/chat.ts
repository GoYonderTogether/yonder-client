import type { MemberKind } from "../member/member.ts";

export interface ConversationMember {
	memberId: string;
	kind: MemberKind;
	handle: string;
	displayName: string;
	avatarUrl: string | null;
	avatarColor?: string | null;
	/** A group's owner is the one who created it (19 第三节); absent in a direct chat. */
	role?: "owner" | "member";
}

/**
 * What a group-lifecycle message says. The server stores the event and the names as they were at
 * that moment, never a sentence in one language: the interface renders it in the reader's language.
 * `renamed` carries the new name in `title`. A name is a snapshot because the member it names may
 * have left the group since.
 */
export type SystemEventKind = "dissolved" | "removed" | "owner_changed" | "renamed" | "joined";

export interface SystemEvent {
	event: SystemEventKind;
	/** Who did it; null when nobody can be named. */
	actorName: string | null;
	/** Who it was done to: the removed, the new owner, the people who joined. */
	targetNames: string[];
	title?: string;
}

/**
 * Where a stranger stands with someone else's Bot (21 第四节: whoever has the errand pays). It is
 * computed by the server on every read, never stored.
 * - `trial`: the first few messages, paid from the owner's external pool.
 * - `pending`: the trial is used up and the owner has not yet allowed more.
 * - `denied`: the owner declined.
 * - `open`: allowed (the owner approved, or the two are friends) but the visitor has not yet agreed
 *   to pay; the next send is refused with `visit_confirm` until they do.
 * - `self_pay`: the visitor agreed; every message is paid from their own main quota.
 * - `host_pay`: the owner allowed it and chose to pay ("this errand is mine"); paid from the owner's
 *   external pool.
 * - `capped`: `host_pay` whose owner's external pool is empty; the visitor may take over by paying.
 */
export type VisitState = "trial" | "pending" | "denied" | "open" | "self_pay" | "host_pay" | "capped";

export interface ConversationVisit {
	id: string;
	/** `visitor` started the chat; `host` owns the Bot, watches it and decides. A host cannot write. */
	role: "visitor" | "host";
	state: VisitState;
	/** Messages the visitor has sent in the trial, retries counted. */
	trialSent: number;
	trialLimit: number;
	/** The Bot being talked to; in a host's view the other members are the visitor and this Bot. */
	botId: string;
}

/** `POST /v1/visits/:id/approve`: the owner lets the chat continue; `hostPays` is "this errand is mine". */
export interface ApproveVisitRequest {
	hostPays?: boolean;
}

export interface Conversation {
	id: string;
	kind: "direct" | "group";
	isPrimary?: boolean;
	title: string | null;
	members: ConversationMember[];
	/** The group owner's member id; groups only. */
	ownerId?: string;
	/**
	 * Why this group can be read but no longer written to, from the viewer's side: the owner
	 * dissolved it, or the viewer was removed from it. Absent or null while it is open.
	 */
	closedReason?: "dissolved" | "removed" | null;
	dissolvedAt?: string | null;
	/** Present only in a chat between a stranger and someone else's Bot. */
	visit?: ConversationVisit | null;
	lastMessageAt: string | null;
	lastMessage?: {
		body: string | null;
		senderKind: MemberKind;
		createdAt: string;
		/** Set for a system message, so the list row can show it in the reader's language. */
		type?: "text" | "task_notice" | "system";
		system?: SystemEvent;
	} | null;
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
	/**
	 * `task_notice` is a system event about a subtask, not a Bot reply. `system` is a group
	 * lifecycle event (dissolved, removed, a new owner, a rename, someone joined): no sender is
	 * speaking, the interface draws it as a centred line from `system`.
	 */
	type: "text" | "task_notice" | "system";
	system?: SystemEvent;
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

/** `POST /v1/visits`: open (or find) the chat with another person's Bot by its public handle. */
export interface StartVisitRequest {
	handle: string;
}

export interface StartVisitResponse {
	bot: import("../member/member.ts").Member;
	conversation: Conversation;
}

/** `PATCH /v1/bots/:id`: only the fields present change; `clearAvatar` returns it to its colour. */
export interface UpdateBotRequest {
	displayName?: string;
	avatarColor?: string;
	clearAvatar?: boolean;
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

/** `PATCH /v1/conversations/:id`: the owner renames the group. */
export interface UpdateGroupRequest {
	title: string;
}

/** `POST /v1/conversations/:id/members`: the owner adds people from their own contacts. */
export interface AddGroupMembersRequest {
	memberIds: string[];
}

/** `POST /v1/conversations/:id/owner`: the owner hands the group to another member. */
export interface TransferGroupOwnerRequest {
	memberId: string;
}
