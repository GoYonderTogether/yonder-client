/**
 * How a failed run reads to the owner (docs/architecture.md「系统行」on the server side). One table for
 * the chat, the mini program, the items list and the item detail, in both languages, so a code never
 * reads two ways.
 *
 * Two tones only:
 * - `action`: the owner can do something about it (a pool ran out, a model is missing).
 * - `quiet`: the turn simply did not happen. One short sentence, no internal terms.
 *
 * A code this table does not know is a failure inside our own machinery — a reply-protocol break, a
 * checkpoint that would not parse, a persistence error. The owner reads the quiet line and nothing
 * else; the code stays in the run record, the admin view and the Bot's own context.
 */
export type FailureTone = "action" | "quiet";

interface Copy {
	zh: string;
	en: string;
	tone: FailureTone;
}

const RUN_FAILURE: Record<string, Copy> = {
	model_not_configured: { zh: "模型没有配置", en: "No model configured", tone: "action" },
	main_quota_exhausted: { zh: "主额度已用完", en: "Main quota is used up", tone: "action" },
	background_quota_exhausted: { zh: "后台额度已用完", en: "Background quota is used up", tone: "action" },
	background_quota_floor: { zh: "后台额度已用完", en: "Background quota is used up", tone: "action" },
	coding_quota_exhausted: { zh: "执行额度已用完", en: "Execution quota is used up", tone: "action" },
	coding_quota_floor: { zh: "执行额度已用完", en: "Execution quota is used up", tone: "action" },
	external_quota_exhausted: { zh: "对外额度已用完", en: "External quota is used up", tone: "action" },
	tools_quota_exhausted: { zh: "工具额度已用完", en: "Tools quota is used up", tone: "action" },
	idle_timeout: { zh: "Bot 长时间没有进展，已停下", en: "The Bot stalled and stopped", tone: "quiet" },
	tool_repeat: { zh: "Bot 卡在重复操作上，已停下", en: "The Bot got stuck repeating itself", tone: "quiet" },
	subtask_burst: { zh: "派出的任务太多，已暂停", en: "Too many tasks at once, so it paused", tone: "quiet" },
};

/** What the owner reads when the reason is one of our own internal failures. */
const QUIET: Copy = { zh: "这次没有回复", en: "No reply this time", tone: "quiet" };

const SCHEDULE_FAILURE: Record<string, Copy> = {
	background_quota_exhausted: {
		zh: "「{title}」没有运行：后台额度已用完",
		en: "「{title}」 did not run: background quota is used up",
		tone: "action",
	},
	background_quota_floor: {
		zh: "「{title}」没有运行：后台额度已用完",
		en: "「{title}」 did not run: background quota is used up",
		tone: "action",
	},
	idle_timeout: { zh: "「{title}」这次没有完成", en: "「{title}」 did not finish", tone: "quiet" },
	tool_repeat: { zh: "「{title}」这次没有完成", en: "「{title}」 did not finish", tone: "quiet" },
	subtask_burst: { zh: "「{title}」派出的任务太多，已暂停", en: "「{title}」 paused: too many tasks", tone: "quiet" },
};

const SCHEDULE_QUIET: Copy = { zh: "「{title}」这次没有执行", en: "「{title}」 did not run", tone: "quiet" };

function pick(copy: Copy, locale: string): string {
	return locale === "zh-CN" ? copy.zh : copy.en;
}

/** A reply that failed: the sentence and the tone that decides its colour. */
export function runFailureText(reason: string | null | undefined, locale: string): { text: string; tone: FailureTone } {
	const copy = (reason && RUN_FAILURE[reason]) || QUIET;
	return { text: pick(copy, locale), tone: copy.tone };
}

/** A plan that did not run: the same rules, with the plan's own title. */
export function scheduleFailureText(
	reason: string | null | undefined,
	title: string,
	locale: string,
): { text: string; tone: FailureTone } {
	const copy = (reason && SCHEDULE_FAILURE[reason]) || SCHEDULE_QUIET;
	return { text: pick(copy, locale).replace("{title}", title), tone: copy.tone };
}

/**
 * A failure that said nothing: no body, no attachments. Such a reply leaves no bubble, so the notice
 * takes its place in the chat rather than hanging under an empty one.
 */
export function isSilentFailure(message: {
	type?: string | undefined;
	senderKind?: string | undefined;
	body?: string | null | undefined;
	attachments?: readonly unknown[] | undefined;
	run?: { status?: string | undefined } | null | undefined;
}): boolean {
	return (
		message.type === "text" &&
		message.senderKind === "bot" &&
		message.run?.status === "failed" &&
		!message.body?.trim() &&
		!message.attachments?.length
	);
}
