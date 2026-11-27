import type { Message } from "@yonder/protocol";
import { useTranslation } from "react-i18next";

export function quoteSnippet(message: Message) {
	const text = message.body?.trim() || message.attachments[0]?.name || message.meeting?.title || "";
	return Array.from(text.replace(/\s+/g, " ")).slice(0, 80).join("");
}

export function MessageQuote({
	replyTo,
	senderName,
	onJump,
}: {
	replyTo: NonNullable<Message["replyTo"]>;
	senderName: string;
	onJump: ((messageId: string) => void) | undefined;
}) {
	const { t } = useTranslation();
	const status = replyTo.recalled ? t("chat.quoteRecalled") : replyTo.missing ? t("chat.quoteUnavailable") : null;
	const content = (
		<span className="message-quote-content">
			{status ?? (replyTo.snippet ? `${senderName}: ${replyTo.snippet}` : senderName)}
		</span>
	);
	if (replyTo.missing || !onJump)
		return (
			<blockquote className="message-quote" data-message-quote>
				{content}
			</blockquote>
		);
	return (
		<button type="button" className="message-quote" data-message-quote onClick={() => onJump(replyTo.id)}>
			{content}
		</button>
	);
}
