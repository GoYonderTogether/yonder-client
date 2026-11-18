import { Button } from "@yonder/ui-components";
import { ApiError, useStartBotChat } from "@yonder/ui-data";
import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The card's one action: chat with this person's Bot. The server opens the chat or finds the one
 * that already exists and answers with the conversation, which is handed to `onOpen`; the first
 * few messages are free, so nothing is asked before it.
 */
export function StartBotChatButton({
	handle,
	onOpen,
	label,
	block = false,
}: {
	handle: string;
	onOpen: (conversationId: string) => void;
	/** Overrides the default label when the surrounding card has its own wording. */
	label?: string;
	block?: boolean;
}) {
	const { t } = useTranslation();
	const start = useStartBotChat();
	return (
		<div className={block ? "flex w-full flex-col gap-[var(--spacing-1)]" : "flex flex-col gap-[var(--spacing-1)]"}>
			<Button
				variant="primary"
				block={block}
				loading={start.isPending}
				onClick={() => start.mutate(handle, { onSuccess: (result) => onOpen(result.conversation.id) })}
			>
				<MessageSquare size={16} aria-hidden="true" />
				{label ?? t("visits.startChat")}
			</Button>
			{start.error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{start.error instanceof ApiError ? t(start.error.messageKey) : t("visits.startFailed")}
				</p>
			) : null}
		</div>
	);
}
