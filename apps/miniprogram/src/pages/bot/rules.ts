import { ApiError } from "@yonder/api-client";
import { botRoleProblem } from "@yonder/chat-model";
import type { Member, UpdateBotRequest } from "@yonder/protocol";
import { t } from "../../lib/i18n";

/** Same as the server's `NAME_MAX`: counted by code points, not UTF-16 units. */
export const BOT_NAME_MAX = 40;
export const BOT_COLORS = ["1", "2", "3", "4", "5", "6"] as const;
export type BotColor = (typeof BOT_COLORS)[number];

export function isBotColor(value: string): value is BotColor {
	return (BOT_COLORS as readonly string[]).includes(value);
}

/** The colour a Bot is drawn in when it never picked one. */
export function colorOf(bot: Pick<Member, "avatarColor">): BotColor {
	return bot.avatarColor && isBotColor(bot.avatarColor) ? bot.avatarColor : "1";
}

export function nameProblem(name: string): string | null {
	const trimmed = name.trim();
	if (!trimmed) return t("名字不能为空", "A name is required");
	if ([...trimmed].length > BOT_NAME_MAX)
		return t(`名字最多 ${BOT_NAME_MAX} 个字`, `A name can be at most ${BOT_NAME_MAX} characters`);
	return null;
}

/** Only the fields that differ go in the patch; an untouched field is not sent at all. */
export function botChanges(bot: Member, name: string, color: string, roleLabel?: string): UpdateBotRequest {
	const changes: UpdateBotRequest = {};
	const trimmed = name.trim();
	if (trimmed && !nameProblem(trimmed) && trimmed !== bot.displayName) changes.displayName = trimmed;
	if (isBotColor(color) && color !== colorOf(bot)) changes.avatarColor = color;
	if (roleLabel !== undefined && !botRoleProblem(roleLabel)) {
		const role = roleLabel.trim() || null;
		if (role !== (bot.botRoleLabel ?? null)) changes.botRoleLabel = role;
	}
	return changes;
}

export function hasChanges(changes: UpdateBotRequest): boolean {
	return Object.keys(changes).length > 0;
}

/** The account's one default Bot cannot be deleted; it goes with the account (15-Bot生命周期 三). */
export function canDelete(bot: Pick<Member, "isDefault">): boolean {
	return !bot.isDefault;
}

/**
 * What the delete modal says. The count is the plans made in the Bot's private chat, which go with
 * it; `null` means the count could not be read, so it is not claimed. The history staying on the
 * server is stated as it is, not as "deleted for good".
 */
export function deleteMessage(plans: number | null): string {
	const lines: string[] = [];
	if (plans === null) lines.push(t("它的定时计划会一起删除。", "Its scheduled plans are deleted with it."));
	else if (plans === 1) lines.push(t("它的 1 个定时计划会一起删除。", "Its 1 scheduled plan will be deleted with it."));
	else if (plans > 1)
		lines.push(t(`它的 ${plans} 个定时计划会一起删除。`, `Its ${plans} scheduled plans will be deleted with it.`));
	lines.push(
		t(
			"它的私聊会从消息列表消失，历史消息留在服务器上，随账号清理任务清除。",
			"Its private chat leaves your message list; the history stays on the server and is cleared with the account.",
		),
	);
	return lines.join("\n");
}

/**
 * The sentence for a refused Bot action, chosen by the code the server sends. A code this page
 * does not know keeps the server's own message rather than a friendlier claim.
 */
export function botFailure(error: unknown): string {
	if (!(error instanceof ApiError))
		return t("网络不通，请检查网络后重试", "Could not reach the server. Check your connection.");
	switch (error.code) {
		case "default_bot_protected":
			return t("默认 Bot 不能删除", "The default bot cannot be deleted");
		case "rate_limited":
			return t("操作太频繁，稍后再试", "Too many attempts. Try again later");
		case "upload_invalid":
			return t("这个文件不能做头像", "That file cannot be used as an avatar");
		case "invalid_request":
			return t(
				`名字要 1–${BOT_NAME_MAX} 个字，头像颜色只有六种`,
				`A name is 1–${BOT_NAME_MAX} characters, and there are six avatar colours`,
			);
		case "not_found":
			return t("这个 Bot 不在了", "This bot is gone");
		default:
			return error.message;
	}
}
