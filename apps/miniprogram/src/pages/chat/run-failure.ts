import type { Locale } from "../../lib/i18n";

const SENTENCES: Record<string, { zh: string; en: string }> = {
	tool_repeat: {
		zh: "Bot 反复执行同一个操作，已停止。",
		en: "The Bot kept repeating the same action, so it was stopped.",
	},
	idle_timeout: {
		zh: "Bot 长时间没有进展，已经停下。",
		en: "The Bot made no progress for a long time, so it was stopped.",
	},
	model_not_configured: { zh: "模型没有配置", en: "No model configured" },
	main_quota_exhausted: {
		zh: "主额度已用完，这条消息没有回复。",
		en: "Main quota is used up, so this message was not answered.",
	},
	external_quota_exhausted: {
		zh: "对外额度已用完，这条消息没有回复。",
		en: "External quota is used up, so this message was not answered.",
	},
};

/**
 * Why a run failed, in one language. A code this table knows reads as a sentence (the same words
 * the web app uses); any other reason is the server's own text and is shown as it came, so a
 * failure is never hidden behind a stand-in.
 */
export function runFailureSentence(reason: string | null | undefined, locale: Locale): string {
	if (!reason) return locale === "zh-CN" ? "生成失败" : "Generation failed";
	const known = SENTENCES[reason];
	if (!known) return reason;
	return locale === "zh-CN" ? known.zh : known.en;
}
