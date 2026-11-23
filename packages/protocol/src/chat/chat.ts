import type { MemberKind } from "../member/member.ts";

export interface ConversationMember {
	memberId: string;
	kind: MemberKind;
	handle: string;
	displayName: string;
	avatarUrl: string | null;
	avatarColor?: string | null;
	botOwner?: { handle: string; displayName: string } | null;
	/** A group's owner is the one who created it (19 第三节); absent in a direct chat. */
	role?: "owner" | "member";
}

/**
 * What a group-lifecycle message says. The server stores the event and the names as they were at
 * that moment, never a sentence in one language: the interface renders it in the reader's language.
 * `renamed` carries the new name in `title`. A name is a snapshot because the member it names may
 * have left the group since.
 */
export interface GroupSystemEvent {
	event: "dissolved" | "removed" | "owner_changed" | "renamed" | "joined" | "created";
	/** Who did it; null when nobody can be named. */
	actorName: string | null;
	/** Who it was done to: the removed, the new owner, or the initial or newly added members. */
	targetNames: string[];
	title?: string;
}

/**
 * One file a Bot changed during a reply. `version` is the last version the reply wrote and
 * `previousVersion` the version before the reply's first write (0: the reply created the file). A
 * reply can write the same file more than once, so the change is the span between the two.
 */
export interface MemoryUpdateChange {
	path: string;
	title: string;
	version: number;
	previousVersion: number;
}

/**
 * The Bot changed memory while answering the owner (24 第六节). One line per reply, however many
 * files it touched. Checkpoints and summaries never send this.
 */
export interface MemoryUpdatedSystemEvent {
	event: "memory_updated";
	changes: MemoryUpdateChange[];
}

/**
 * The photo archive stopped, ended or finished (11-23). It states a fact, so it is a system line and
 * never a Bot reply. `month` is the first month not organized (YYYY-MM); `months` is how many months
 * with photos are in memory.
 */
export interface PhotoArchiveSystemEvent {
	event: "photo_archive";
	state: "stopped" | "ended" | "finished";
	month?: string;
	months: number;
}

/**
 * The Bot or the owner changed what the photo archive does next. `months` are done first; `until`
 * (YYYY-MM) is how far back it goes, null meaning three years before the grant month.
 */
export interface PhotoArchivePlanSystemEvent {
	event: "photo_archive_plan";
	plan: { paused: boolean; months: string[] | null; until: string | null };
}

export type SystemEvent =
	| GroupSystemEvent
	| MemoryUpdatedSystemEvent
	| PhotoArchiveSystemEvent
	| PhotoArchivePlanSystemEvent;
export type SystemEventKind = SystemEvent["event"];

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

/** The last message hidden from the owner's chat view by a history clear. */
export interface ChatHistoryCutoff {
	messageId: string;
	/** UTC timestamp with six fractional digits, retaining database ordering within a millisecond. */
	createdAt: string;
}

export interface ResetConversationResponse {
	ok: true;
	historyClearedThrough?: ChatHistoryCutoff;
}

export interface Conversation {
	id: string;
	kind: "direct" | "group" | "system";
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
	groupBotPayer?: "mentioner" | "owner";
	dissolvedAt?: string | null;
	/** Present only in a chat between a stranger and someone else's Bot. */
	visit?: ConversationVisit | null;
	historyClearedThrough?: ChatHistoryCutoff;
	lastMessageAt: string | null;
	lastMessage?: {
		body: string | null;
		senderKind: MemberKind;
		createdAt: string;
		/** Set for a system message, so the list row can show it in the reader's language. */
		type?: "text" | "task_notice" | "system";
		system?: SystemEvent;
		voice?: { durationMs: number };
		/** Set when the latest message opens a recording note. */
		recordingNote?: true;
	} | null;
	unreadCount: number;
	muted?: boolean;
	pinned: boolean;
	/** A viewer removed this row from Messages, while the conversation remains accessible. */
	hiddenFromMessages?: boolean;
	version: number;
}

export interface Run {
	id: string;
	conversationId: string;
	messageId: string;
	userMessageId: string;
	status: "queued" | "running" | "completed" | "failed" | "cancelled";
	failureReason?: string | null;
	/** Some event-triggered turns have no user message to retry. */
	canRetry?: false;
	activity?: { label: string; sources?: { title: string; url: string; site?: string | null }[] }[];
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
	friendRequestId?: string;
	connectorRequestId?: string;
	/** An owner-only Agent card, loaded separately. */
	cardId?: string;
	reaction?: string;
	outwardRequest?: import("./outward.ts").OutwardRequestCard;
	channelAttemptId?: string;
	outwardDraft?: boolean;
	options?: string[];
	questionCard?: import("./questions.ts").QuestionCard;
	questionReply?: { question: string };
	/** Image attachment IDs aligned with options, with null for text-only rows. */
	optionImageIds?: (string | null)[];
	id: string;
	conversationId: string;
	senderId: string;
	senderKind: MemberKind;
	/**
	 * `task_notice` is a system event about a subtask, not a Bot reply. `system` carries a group
	 * lifecycle event or a memory update and is displayed as a centred line.
	 */
	type: "text" | "task_notice" | "system";
	system?: SystemEvent;
	body: string | null;
	attachments: Attachment[];
	voice?: { durationMs: number; transcription?: "pending" | "completed" | "failed" };
	replyToId: string | null;
	createdAt: string;
	/** When a streamed reply became eligible for unread counts. */
	readableAt?: string;
	editedAt: string | null;
	streaming: boolean;
	version: number;
	clientNonce?: string | null;
	/** Server-owned reference; opens the inline meeting capsule. */
	meeting?: {
		id: string;
		title: string;
		startedAt?: number;
		endedAt?: number;
		durationMs?: number;
		photoCount?: number;
	};
	/** Server-owned entry to an existing private item conversation. */
	taskSession?: { id: string; title: string };
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
	historyClearedThrough?: ChatHistoryCutoff;
}

export interface SendMessageRequest {
	type: "text" | "voice";
	body: string;
	attachmentIds?: string[];
	voice?: { durationMs: number; transcribe?: true };
	clientNonce: string;
	skillIds?: string[];
	mentionedMemberIds?: string[];
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
	nicknames?: string[];
	selectedNickname?: string | null;
	botRoleLabel?: string | null;
	/** An own provider id or a platform model id to answer with, or null to follow the account default. */
	modelChoice?: string | null;
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
export type UpdateGroupRequest = { title: string } | { groupBotPayer: "mentioner" | "owner" };

/** `POST /v1/conversations/:id/members`: the owner adds people from their own contacts. */
export interface AddGroupMembersRequest {
	memberIds: string[];
}

/** `POST /v1/conversations/:id/owner`: the owner hands the group to another member. */
export interface TransferGroupOwnerRequest {
	memberId: string;
}
