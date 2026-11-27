import { MessageBubble } from "@yonder/chat-presentation";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MessageEntry, type MessageEntryProps } from "./conversation-message-entry.tsx";
import "./decorated-message-entry.css";

export function DecoratedMessageEntry({ quote, ...props }: MessageEntryProps & { quote?: ReactNode }) {
	const { t } = useTranslation();
	const { message, self } = props;
	const feedback = message.senderKind === "bot" ? message.feedback : undefined;
	if (!quote && !feedback) return <MessageEntry {...props} />;

	const Icon = feedback === "up" ? ThumbsUp : ThumbsDown;
	return (
		<div
			data-message-decorated={message.id}
			data-quoted-message-body={quote && message.body?.trim() && !message.voice ? true : undefined}
			className={`decorated-message-entry flex min-w-0 flex-col ${self ? "items-end" : "items-start"}`}
		>
			{quote ? (
				<MessageBubble as="div" self={self}>
					{quote}
				</MessageBubble>
			) : null}
			<MessageEntry {...props} />
			{feedback ? (
				<span
					role="img"
					aria-label={t(feedback === "up" ? "chat.liked" : "chat.disliked")}
					className="p-[var(--spacing-1)] text-[var(--color-accent)]"
				>
					<Icon className="size-[var(--icon-sm)]" aria-hidden="true" />
				</span>
			) : null}
		</div>
	);
}
