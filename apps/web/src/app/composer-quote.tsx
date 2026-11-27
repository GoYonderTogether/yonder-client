import type { Message } from "@yonder/protocol";
import { IconButton } from "@yonder/ui-components";
import { X } from "lucide-react";
import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";

type ReplyTo = NonNullable<Message["replyTo"]>;
export type DraftQuote = { replyTo: ReplyTo; senderName: string };

export const ComposerQuoteContext = createContext<{
	conversationId: string | undefined;
	quote: DraftQuote | undefined;
	setQuote: (quote?: DraftQuote) => void;
} | null>(null);

export function quoteInput(quote: DraftQuote | undefined) {
	return quote ? { replyToId: quote.replyTo.id, replyTo: quote.replyTo } : {};
}

export function ComposerQuoteBar() {
	const { t } = useTranslation();
	const draft = useContext(ComposerQuoteContext);
	if (!draft?.quote) return null;
	const { replyTo, senderName } = draft.quote;
	return (
		<div
			data-message-quote-draft
			className="flex w-full min-w-0 items-center gap-[var(--spacing-2)] overflow-hidden rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] px-[var(--spacing-2)] py-[var(--spacing-1)]"
		>
			<div className="min-w-0 flex-1 text-caption">
				<strong className="block truncate font-medium text-[var(--color-text-primary)]">{senderName}</strong>
				<span className="block truncate text-[var(--color-text-secondary)]">{replyTo.snippet}</span>
			</div>
			<IconButton
				size="sm"
				className="shrink-0"
				aria-label={t("chat.cancelQuote")}
				title={t("chat.cancelQuote")}
				onClick={() => draft.setQuote()}
			>
				<X size={16} aria-hidden="true" />
			</IconButton>
		</div>
	);
}
