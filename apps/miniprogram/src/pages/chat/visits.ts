import type { ConversationVisit, VisitState } from "@yonder/protocol";
import type { Locale } from "../../lib/i18n";

function pair(locale: Locale, zh: string, en: string): string {
	return locale === "zh-CN" ? zh : en;
}

/** The three refusals a visit's ladder can answer a send with (protocol `error.ts`). */
export type VisitErrorCode = "visit_limit" | "visit_denied" | "visit_cap";

export function isVisitErrorCode(code: string): code is VisitErrorCode {
	return code === "visit_limit" || code === "visit_denied" || code === "visit_cap";
}

/**
 * The one line the bar shows, in exactly one language. `trial` is an ordinary chat and `self_pay`
 * is the visitor's own quota, so those states have nothing to say; a host has nothing to do once
 * the visit is past `pending`.
 */
export function visitSentence(visit: ConversationVisit, visitorName: string, locale: Locale): string | null {
	if (visit.role === "host")
		return visit.state === "pending" || visit.state === "capped"
			? pair(locale, `${visitorName} 想继续和你的 Bot 聊天`, `${visitorName} wants to keep messaging your Bot`)
			: null;
	const visitor: Partial<Record<VisitState, string>> = {
		pending: pair(
			locale,
			"免费消息用完了，正在等主人批准。",
			"Free messages used up. Waiting for the owner to approve.",
		),
		capped: pair(
			locale,
			"继续聊天需要你确认使用自己的额度，或由主人选择支付。",
			"To continue, confirm use of your quota or ask the owner to pay.",
		),
		denied: pair(locale, "Bot 的主人拒绝继续这个对话。", "The Bot's owner declined to continue this chat."),
	};
	return visitor[visit.state] ?? null;
}

/** A refused send names what really happened, never the generic retry line. */
export function visitErrorSentence(code: VisitErrorCode, locale: Locale): string {
	switch (code) {
		case "visit_limit":
			return pair(
				locale,
				"和这个 Bot 的免费消息用完了，正在等主人批准。",
				"The free messages with this Bot are used up. Waiting for its owner to approve.",
			);
		case "visit_denied":
			return pair(locale, "Bot 的主人拒绝继续这个对话。", "The Bot's owner declined to continue this chat.");
		case "visit_cap":
			return pair(
				locale,
				"继续聊天需要你确认使用自己的额度，或由主人选择支付。",
				"To continue, confirm use of your quota or ask the owner to pay.",
			);
	}
}
