import type { SystemEvent } from "@yonder/protocol";
import type { Locale } from "../../lib/i18n";

/** Why a group can be read but not written to, from the viewer's side (protocol `closedReason`). */
export type ClosureReason = "dissolved" | "removed";

function pair(locale: Locale, zh: string, en: string): string {
	return locale === "zh-CN" ? zh : en;
}

/** A name list the way the reader writes it; the names are a snapshot from when the event happened. */
export function joinNames(names: readonly string[], locale: Locale): string {
	return names.filter(Boolean).join(locale === "zh-CN" ? "、" : ", ");
}

/**
 * The sentence for one group-lifecycle event, in exactly one language. The server stores only the
 * event and its parameters (19 第三节 3.3), so this is the only place a sentence is made. Pure, so
 * the chat, the conversation list and the tests all read the same words.
 */
export function systemSentence(event: SystemEvent, locale: Locale): string {
	if (event.event === "memory_updated") {
		const [only] = event.changes;
		if (event.changes.length === 1 && only) {
			const title = only.title || only.path;
			return pair(locale, `记忆已更新 · ${title}`, `Memory updated · ${title}`);
		}
		const count = event.changes.length;
		return pair(locale, `记忆已更新 · ${count} 处`, `Memory updated · ${count} files`);
	}
	const names = joinNames(event.targetNames, locale) || pair(locale, "有人", "someone");
	const actor = event.actorName || pair(locale, "有人", "Someone");
	switch (event.event) {
		case "dissolved":
			return pair(locale, "该群聊已被解散", "The group was dissolved");
		case "removed":
			return pair(locale, `${actor} 将 ${names} 移出群聊`, `${actor} removed ${names}`);
		case "joined":
			return pair(locale, `${names} 加入了群聊`, `${names} joined`);
		case "renamed": {
			const title = event.title || pair(locale, "未命名群聊", "an untitled group");
			return pair(locale, `${actor} 将群名改为「${title}」`, `${actor} renamed the group to ${title}`);
		}
		case "owner_changed":
			return pair(locale, `${names} 成为新群主`, `${names} is now the group owner`);
	}
}

/**
 * The one line a closed group shows where the input box used to be. The server answers the same
 * `conversation_closed` code for both reasons, so an unknown reason still says the true thing.
 */
export function closureSentence(reason: ClosureReason | null | undefined, locale: Locale): string {
	if (reason === "dissolved") return pair(locale, "该群聊已被解散", "The group was dissolved");
	if (reason === "removed") return pair(locale, "你已被移出群聊", "You were removed from the group");
	return pair(locale, "这个群聊已不能发消息", "This group no longer accepts messages");
}
