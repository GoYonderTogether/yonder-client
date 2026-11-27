import { ApiError } from "@yonder/ui-data";

/**
 * The message key for a refused send. A visit refusal and a quota refusal are real answers from
 * the server, so they replace the generic "your draft is preserved" line; anything else, including
 * a network failure, keeps that line because the draft really is preserved.
 */
const SEND_REFUSAL_KEYS = new Set(["visit_limit", "visit_denied", "visit_cap"]);

/**
 * A dissolved group, or a chat the sender was removed from, refuses every send with one code: the
 * composer says exactly that, in the members wording, instead of the generic "draft preserved" line
 * (19 3.2). It is a real refusal from the server, never drawn as something the Bot said.
 */
const CONVERSATION_CLOSED_KEY = "members.errors.conversationClosed";

export class AttachmentTooLargeError extends Error {}

export function sendErrorMessageKey(error: unknown): string {
	if (error instanceof AttachmentTooLargeError) return "chat.fileTooLarge";
	if (!(error instanceof ApiError)) return "chat.sendPreserved";
	if (error.code === "conversation_closed") return CONVERSATION_CLOSED_KEY;
	return SEND_REFUSAL_KEYS.has(error.code) ? `errors.${error.code}` : "chat.sendPreserved";
}
