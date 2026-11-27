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
	const content = status ?? (
		<>
			<strong className="block truncate font-medium text-[var(--color-text-primary)]">{senderName}</strong>
			<span className="block truncate">{replyTo.snippet}</span>
		</>
	);
	const className =
		"mb-[var(--spacing-2)] min-w-0 max-w-full border-s border-[var(--color-border)] ps-[var(--spacing-2)] text-start text-caption text-[var(--color-text-secondary)]";
	if (replyTo.missing || !onJump)
		return (
			<blockquote className={className} data-message-quote>
				{content}
			</blockquote>
		);
	return (
		<button
			type="button"
			data-message-quote
			className={`block ${className} hover:text-[var(--color-text-primary)] focus-visible:outline-[var(--color-accent)]`}
			onClick={() => onJump(replyTo.id)}
		>
			{content}
		</button>
	);
}
