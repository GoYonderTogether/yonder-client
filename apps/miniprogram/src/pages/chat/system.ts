import type { SystemEvent } from "@yonder/protocol";
import type { Locale } from "../../lib/i18n";

/** Why a group can be read but not written to, from the viewer's side (protocol `closedReason`). */
export type ClosureReason = "dissolved" | "removed";

function pair(locale: Locale, zh: string, en: string): string {
	return locale === "zh-CN" ? zh : en;
}

/** A name list the way the reader writes it; the names are a snapshot from when the event happened. */
export function joinNames(names: readonly string[], locale: Locale): string {
	return names.filter((name) => name.trim() !== "").join(locale === "zh-CN" ? "、" : ", ");
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
	if (event.event === "model_fallback") {
		// The owner's own provider could not answer; the account is on the platform model until `until`.
		return pair(
			locale,
			`${event.providerName} 的 ${event.model} 不可用，模型已切换至 ${event.fallbackModel}`,
			`${event.providerName} ${event.model} is unavailable; the model switched to ${event.fallbackModel}`,
		);
	}
	if (event.event === "photo_archive_plan") {
		const { paused, months, until } = event.plan;
		if (paused) return pair(locale, "相册整理已暂停。", "Photo organizing is paused.");
		const list = months?.length ? joinNames(months, locale) : "";
		if (list && until)
			return pair(
				locale,
				`相册整理接下来先做 ${list}，往前做到 ${until}。`,
				`Photo organizing does ${list} next and goes back to ${until}.`,
			);
		if (list) return pair(locale, `相册整理接下来先做 ${list}。`, `Photo organizing does ${list} next.`);
		if (until) return pair(locale, `相册整理往前做到 ${until}。`, `Photo organizing goes back to ${until}.`);
		return pair(locale, "相册整理继续进行。", "Photo organizing goes on.");
	}
	if (event.event === "photo_archive") {
		const count = event.months;
		if (event.state === "finished")
			return pair(
				locale,
				`相册整理完成，记忆里有 ${count} 个月。`,
				`Your photos are organized, with ${count} months in memory.`,
			);
		const [year = "", month = ""] = (event.month ?? "").split("-");
		const at = pair(locale, `${year} 年 ${Number(month)} 月`, `${Number(month)}/${year}`);
		return event.state === "stopped"
			? pair(
					locale,
					`照片连接已关闭，相册整理停在 ${at}，记忆里有 ${count} 个月。重新连接后从这里接着做。`,
					`Photos was disconnected. Organizing stopped at ${at}, with ${count} months in memory. Reconnect to continue from there.`,
				)
			: pair(
					locale,
					`相册整理中断，停在 ${at}，最近一年已整理完，记忆里有 ${count} 个月。`,
					`Organizing was interrupted at ${at}. The last year is done, with ${count} months in memory.`,
				);
	}
	const targets = joinNames(event.targetNames, locale);
	const names = targets || pair(locale, "有人", "someone");
	const actor = event.actorName || pair(locale, "有人", "Someone");
	switch (event.event) {
		case "dissolved":
			return pair(locale, "该群聊已被解散", "The group was dissolved");
		case "removed":
			return pair(locale, `${actor} 将 ${names} 移出群聊`, `${actor} removed ${names}`);
		case "joined":
			return pair(locale, `${names} 加入了群聊`, `${names} joined`);
		case "created":
			return targets
				? pair(locale, `${actor} 创建了群聊，${targets} 加入了群聊`, `${actor} created the group. ${targets} joined`)
				: pair(locale, `${actor} 创建了群聊`, `${actor} created the group`);
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
