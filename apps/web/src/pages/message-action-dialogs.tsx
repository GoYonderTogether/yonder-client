import { ApiError, useContacts, useDeleteMessage, useMessageFeedback, useRecallMessage } from "@yonder/ui-data";
import { ConfirmDialog } from "@yonder/ui-shell";
import { type ComponentProps, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppNotice } from "../app/app-notice.tsx";
import { ConversationMessages, isOwnedBotChat } from "./conversation-messages.tsx";
import { ForwardMessageDialog } from "./forward-message-dialog.tsx";

function messageActionError(error: unknown, fallback: string) {
	if (!(error instanceof ApiError)) return fallback;
	if (error.code === "recall_window_closed") return "chat.recallWindowClosed";
	if (error.code === "not_allowed") return "chat.messageActionNotAllowed";
	if (error.code === "not_found") return "chat.quoteUnavailable";
	return fallback;
}

export function MessageDeleteDialog({
	ownedBotChat,
	busy,
	onClose,
	onDelete,
	error,
}: {
	ownedBotChat: boolean;
	busy: boolean;
	onClose: () => void;
	onDelete: () => void;
	error?: unknown;
}) {
	const { t } = useTranslation();
	return (
		<ConfirmDialog
			open
			title={t("chat.deleteMessageTitle")}
			body={t(ownedBotChat ? "chat.deleteMessageBotBody" : "chat.deleteMessageForMeBody")}
			confirmLabel={t("chat.deleteMessage")}
			cancelLabel={t("app.cancel")}
			closeLabel={t("app.close")}
			backLabel={t("app.back")}
			busy={busy}
			error={error ? t(messageActionError(error, "chat.deleteMessageFailed")) : null}
			onCancel={() => {
				if (!busy) onClose();
			}}
			onConfirm={onDelete}
		/>
	);
}

export function InteractiveConversationMessages(props: ComponentProps<typeof ConversationMessages>) {
	const { t } = useTranslation();
	const notify = useAppNotice();
	const { conversation, person, bot } = props;
	const contacts = useContacts();
	const members = props.contacts ?? contacts.data?.items;
	const recall = useRecallMessage(conversation.id);
	const remove = useDeleteMessage(conversation.id);
	const feedback = useMessageFeedback(conversation.id);
	const voting = useRef(new Set<string>());
	const [dialog, setDialog] = useState<{ type: "forward" | "delete"; messageId: string }>();
	const showFailure = (messageId: string, error: unknown, fallback: string) =>
		notify({ key: `${fallback}-${messageId}`, text: t(messageActionError(error, fallback)), tone: "error" });

	return (
		<>
			<ConversationMessages
				{...props}
				contacts={members}
				messageActions={{
					forward: (message) => setDialog({ type: "forward", messageId: message.id }),
					delete: (message) => {
						remove.reset();
						setDialog({ type: "delete", messageId: message.id });
					},
					recall: (message) =>
						void recall.mutateAsync(message.id).catch((error) => showFailure(message.id, error, "chat.recallFailed")),
					feedback: (message, value) => {
						if (voting.current.has(message.id)) return;
						voting.current.add(message.id);
						void feedback
							.mutateAsync({ messageId: message.id, value })
							.catch((error) => showFailure(message.id, error, "chat.feedbackFailed"))
							.finally(() => voting.current.delete(message.id));
					},
				}}
			/>
			{dialog?.type === "forward" ? (
				<ForwardMessageDialog messageId={dialog.messageId} personId={person?.id} onClose={() => setDialog(undefined)} />
			) : null}
			{dialog?.type === "delete" ? (
				<MessageDeleteDialog
					ownedBotChat={isOwnedBotChat(conversation, person, bot, members)}
					busy={remove.isPending}
					onClose={() => setDialog(undefined)}
					onDelete={() =>
						void remove.mutateAsync(dialog.messageId).then(
							() => setDialog(undefined),
							() => {},
						)
					}
					error={remove.error}
				/>
			) : null}
		</>
	);
}
