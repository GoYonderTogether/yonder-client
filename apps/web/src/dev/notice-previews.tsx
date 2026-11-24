import { runFailureText } from "@yonder/chat-model";
import { MessageBubble, MessageRun, SystemNotice } from "@yonder/chat-presentation";
import { Avatar, Button } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";
import { Section } from "./preview-parts.tsx";

const REASONS = [
	"main_quota_exhausted",
	"tools_quota_exhausted",
	"reply_protocol",
	"persistence_error",
	"idle_timeout",
	"tool_repeat",
] as const;

/** The old rendering, kept only here to compare against: a red caption under the Bot's bubble. */
function BeforeFailure() {
	const { t } = useTranslation();
	return (
		<MessageRun
			as="div"
			self={false}
			senderId="bot_before"
			avatar={<Avatar name={t("dev.notices.bot")} kind="bot" size={32} />}
		>
			<MessageBubble as="div" self={false}>
				<span>{t("dev.notices.reply")}</span>
			</MessageBubble>
			<div role="alert" className="flex items-center gap-[var(--spacing-2)] text-caption text-[var(--color-danger)]">
				Bot 没有按回复规则发送这条回复，这次回复没有成功。
				<Button variant="link" size="sm">
					{t("app.retry")}
				</Button>
			</div>
		</MessageRun>
	);
}

/**
 * The owner's side of a failed run, in the same shape the chat draws it: the run (bubble + avatar),
 * then one centred line after it. Never a red caption under the bubble. Every sentence and its tone
 * come from `runFailureText`, the same function the chat and the mini program use.
 */
export function NoticePreviews() {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const retry = (
		<Button variant="link" size="sm">
			{t("app.retry")}
		</Button>
	);
	const notice = runFailureText("main_quota_exhausted", locale);
	return (
		<Section name="System notices · 失败提示">
			<div className="mx-auto flex w-full max-w-[640px] flex-col gap-[var(--spacing-8)]">
				<div className="flex flex-col gap-[var(--spacing-3)]">
					<span className="text-caption font-semibold text-[var(--color-text-secondary)]">
						{t("dev.notices.beforeLabel")}
					</span>
					<div className="rounded-[var(--radius-panel)] bg-[var(--color-bg-base)] p-[var(--spacing-4)]">
						<BeforeFailure />
					</div>
				</div>

				<div className="flex flex-col gap-[var(--spacing-3)]">
					<span className="text-caption font-semibold text-[var(--color-text-secondary)]">
						{t("dev.notices.afterLabel")}
					</span>
					<div className="flex flex-col gap-[var(--spacing-4)] rounded-[var(--radius-panel)] bg-[var(--color-bg-base)] p-[var(--spacing-4)]">
						<MessageRun
							as="div"
							self={false}
							senderId="bot_preview"
							avatar={<Avatar name={t("dev.notices.bot")} kind="bot" size={32} />}
						>
							<MessageBubble as="div" self={false}>
								<span>{t("dev.notices.reply")}</span>
							</MessageBubble>
						</MessageRun>
						<SystemNotice as="div" tone={notice.tone} role="alert" action={retry}>
							{notice.text}
						</SystemNotice>
					</div>
				</div>
			</div>

			<div className="mx-auto flex w-full max-w-[640px] flex-col gap-[var(--spacing-1)] rounded-[var(--radius-panel)] border border-[var(--color-border-subtle)] p-[var(--spacing-2)]">
				{REASONS.map((reason) => {
					const line = runFailureText(reason, locale);
					return (
						<div
							key={reason}
							className="flex flex-col gap-[var(--spacing-1)] px-[var(--spacing-3)] py-[var(--spacing-2)]"
						>
							<span className="text-micro text-[var(--color-text-tertiary)]">{reason}</span>
							<SystemNotice as="div" tone={line.tone} role="note" action={retry}>
								{line.text}
							</SystemNotice>
						</div>
					);
				})}
			</div>
		</Section>
	);
}
