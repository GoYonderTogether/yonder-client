import { MessageBubble, MessageRun } from "@yonder/chat-presentation";
import { Avatar } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";
import { MessageContent } from "../pages/message-content.tsx";
import { Section } from "./preview-parts.tsx";

/** The reply the Bot is about to send, in the markup the prompt now asks for. */
const AFTER = [
	"那场会我看完了，最关键的一句在第 36 分钟。",
	"",
	"你之前说：",
	"> 转写质量太差，碎片化的对话根本没法用。",
	"",
	"这次的两处改动在 `src/pages/message-content.tsx`，跑 `npm run check` 会验。会议纪要整理好了，在[这里](https://example.com/notes)。",
].join("\n");

/** The same reply in the shapes the prompt now rules out. */
const BEFORE = [
	"那场会我看完了，最关键的一句在第 36 分钟，原文在这里 https://example.com/notes 。",
	"",
	"> 转写质量太差，碎片化的对话根本没法用。",
	"",
	"这次的两处改动在 src/pages/message-content.tsx，跑 npm run check 会验。会议纪要整理好了，在这里 https://example.com/notes 。",
].join("\n");

function Bubble({ label, body }: { label: string; body: string }) {
	return (
		<div className="flex min-w-0 flex-col gap-[var(--spacing-2)]">
			<span className="text-caption font-semibold text-[var(--color-text-secondary)]">{label}</span>
			<div className="rounded-[var(--radius-panel)] bg-[var(--color-bg-base)] p-[var(--spacing-4)]">
				<MessageRun as="div" self={false} senderId={`bot_${label}`}>
					<MessageBubble as="div" self={false}>
						<MessageContent body={body} />
					</MessageBubble>
				</MessageRun>
			</div>
		</div>
	);
}

/**
 * How a reply is drawn: a link the owner can open, a code span they can copy, a quote that reads
 * as someone else's words. The before half is the shape the system prompt ruled out — a bare
 * address, a path as plain text, and a quote with nothing introducing it.
 */
export function ReplyPreviews() {
	const { t } = useTranslation();
	return (
		<Section name={t("dev.replies.title")}>
			<p className="text-caption text-[var(--color-text-secondary)]">{t("dev.replies.intro")}</p>
			{/* A container query, not a viewport one: the phone toggle narrows this card while the
			    window stays desktop wide, and two 160 px bubbles would prove nothing. */}
			<div className="@container">
				<div className="grid gap-[var(--spacing-4)] @3xl:grid-cols-2">
					<Bubble label={t("dev.replies.beforeLabel")} body={BEFORE} />
					<Bubble label={t("dev.replies.afterLabel")} body={AFTER} />
				</div>
			</div>
			<div className="flex flex-col gap-[var(--spacing-2)]">
				<span className="text-caption font-semibold text-[var(--color-text-secondary)]">
					{t("dev.replies.avatarLabel")}
				</span>
				<div className="rounded-[var(--radius-panel)] bg-[var(--color-bg-base)] p-[var(--spacing-4)]">
					<MessageRun
						as="div"
						self={false}
						senderId="bot_reply"
						avatar={<Avatar name={t("dev.notices.bot")} kind="bot" size={32} />}
					>
						<MessageBubble as="div" self={false}>
							<MessageContent body={AFTER} />
						</MessageBubble>
					</MessageRun>
				</div>
			</div>
		</Section>
	);
}
