import type { Conversation } from "@yonder/protocol";
import type { Locale } from "../../lib/i18n";
import { systemSentence } from "../chat/system";

/** The one-line preview of the last message; a system event reads as the same sentence the chat shows. */
export function conversationPreview(
	conversation: Conversation,
	locale: Locale,
	fallback: { group: string; direct: string },
): string {
	const last = conversation.lastMessage;
	if (last?.type === "system" && last.system) return systemSentence(last.system, locale);
	if (last?.recordingNote) return locale === "zh-CN" ? "[录音笔记]" : "[Recording notes]";
	if (last?.voice) return locale === "zh-CN" ? "语音消息" : "Voice message";
	return last?.body || (conversation.kind === "group" ? fallback.group : fallback.direct);
}
