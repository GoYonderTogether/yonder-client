/**
 * Message notifications, as one contract shared by the server and every client.
 *
 * The rules live in `yonder/docs/notifications.md`. This file is only the vocabulary: what a
 * notification says, which device it goes to, and the account setting that decides how much of the
 * message a push may show.
 */

/** What caused the notification. A client groups and de-duplicates by it. */
export type NotificationKind =
	/** Someone else wrote in a conversation: a person in a direct or group chat, or a stranger's visit. */
	| "message"
	/** A Bot finished a reply, a question card or a group answer. */
	| "bot_reply"
	/** An item ended: a subtask, a task session or a recording. `outcome` says how. */
	| "item_ended";

export type NotificationOutcome = "completed" | "failed" | "waiting_user";

/**
 * One notification, whether it arrives on the socket (`notification.created`) or as the body of a
 * push. `body` is already decided: a client shows it as given and never re-derives it from the
 * message, because the account's own `content` setting decided whether text may appear at all.
 */
export interface MessageNotification {
	id: string;
	kind: NotificationKind;
	/** The conversation to open. Absent only for a notification with nothing to open. */
	conversationId?: string;
	/** The message to focus, when the notification is about one. */
	messageId?: string;
	/** Whose words these are: the sender's display name, or the account's own Bot. */
	senderName: string;
	/** The group's or the chat's title; absent for a direct chat with no title of its own. */
	conversationTitle?: string;
	senderKind: "person" | "bot" | "system";
	/** The notification's text, truncated to `NOTIFICATION_BODY_MAX`. */
	body: string;
	/** Items only: which outcome ended it, and the item to open. */
	outcome?: NotificationOutcome;
	itemId?: string;
}

/** The longest body a notification carries; the client truncates what it displays to this. */
export const NOTIFICATION_BODY_MAX = 120;

/**
 * How much of a message a notification may show. `full` is the default: the push reads like the
 * message. `hidden` says only that something arrived, for an account that shares a lock screen.
 * This is the account's setting; iOS and Android have their own per-app preview switches on top.
 */
export type NotificationContent = "full" | "hidden";

/** `GET`/`PATCH /v1/me/notifications`. */
export interface NotificationPreferences {
	content: NotificationContent;
	version: number;
}

export interface UpdateNotificationPreferencesRequest {
	content: NotificationContent;
	version: number;
}
