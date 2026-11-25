import type { Member } from "@yonder/protocol";
import { Button, ConversationList } from "@yonder/ui-components";
import { useAccountTimeZone, useBot, useConversationListActions, useConversations, usePerson } from "@yonder/ui-data";
import { ConfirmDialog, ListFrame, MAIN_CONVERSATION, useShellChrome } from "@yonder/ui-shell";
import { Pin, PinOff, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatActions } from "./chat-actions/index.tsx";
import { conversationTitle, primaryConversation } from "./conversation-presentation.tsx";
import { ConversationEntry } from "./conversation-row.tsx";

export function MessagesList({
	current,
	contacts,
	onOpen,
	onOpenMeetings,
}: {
	current: string | null;
	contacts?: readonly Member[] | undefined;
	onOpen: (id: string) => void;
	onOpenMeetings?: () => void;
}) {
	const { t, i18n } = useTranslation();
	const zone = useAccountTimeZone();
	const { mode } = useShellChrome();
	const bot = useBot();
	const conversations = useConversations();
	const items = conversations.data?.items;
	const primary = primaryConversation(items, bot?.id);
	const visible = useMemo(
		() =>
			items
				?.filter(
					(conversation) => !conversation.hiddenFromMessages && (mode !== "mobile" || conversation.id !== primary?.id),
				)
				.sort((a, b) => Number(b.pinned) - Number(a.pinned)),
		[items, mode, primary?.id],
	);
	const person = usePerson();
	const { pin, remove } = useConversationListActions();
	const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);
	const busy = pin.isPending || remove.isPending;
	return (
		<ListFrame
			title={mode === "mobile" ? "" : t("nav.messages")}
			action={<ChatActions onOpen={onOpen} {...(onOpenMeetings ? { onOpenMeetings } : {})} />}
		>
			{conversations.isError ? (
				<Button variant="link" onClick={() => void conversations.refetch()}>
					{t("app.retry")}
				</Button>
			) : null}
			{pin.isError ? (
				<p role="alert" className="px-[var(--spacing-3)] text-caption text-[var(--color-danger)]">
					{t("messages.pinFailed")}
				</p>
			) : null}
			<ConversationList label={t("nav.messages")}>
				{visible?.map((conversation) => {
					const title =
						conversation.kind === "system"
							? t("friendRequests.notifications")
							: conversationTitle(conversation, person?.id);
					return (
						<ConversationEntry
							key={conversation.id}
							conversation={conversation}
							current={current}
							personId={person?.id}
							bot={bot}
							primary={primary?.id}
							contacts={contacts}
							mobile={mode === "mobile"}
							locale={i18n.resolvedLanguage ?? i18n.language}
							zone={zone}
							t={t}
							actions={[
								{
									label: t(conversation.pinned ? "messages.unpin" : "messages.pin"),
									icon: conversation.pinned ? <PinOff /> : <Pin />,
									onSelect: () => pin.mutate({ id: conversation.id, pinned: !conversation.pinned }),
									disabled: busy,
								},
								{
									label: t("messages.delete"),
									icon: <Trash2 />,
									tone: "danger",
									onSelect: () => {
										remove.reset();
										setDeleting({ id: conversation.id, title });
									},
									disabled: busy,
								},
							]}
							onOpen={() => onOpen(conversation.id === primary?.id ? MAIN_CONVERSATION : conversation.id)}
						/>
					);
				})}
			</ConversationList>
			{deleting ? (
				<ConfirmDialog
					open
					title={t("messages.deleteTitle")}
					body={t("messages.deleteBody", { name: deleting.title })}
					confirmLabel={t("messages.delete")}
					cancelLabel={t("app.cancel")}
					closeLabel={t("app.close")}
					backLabel={t("app.back")}
					busy={remove.isPending}
					error={remove.isError ? t("messages.deleteFailed") : null}
					onCancel={() => {
						if (!remove.isPending) setDeleting(null);
					}}
					onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
				/>
			) : null}
		</ListFrame>
	);
}

/** Re-exported so a frame that already imports this list keeps one line per directory. */
export { ConversationPage } from "./conversation-page.tsx";
