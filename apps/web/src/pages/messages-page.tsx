import { Button, ConversationList, ConversationRow, EmptyState } from "@yonder/ui-components";
import {
	type CachedMessage,
	useBot,
	useConversations,
	useMessages,
	usePerson,
	useQuota,
	useRunActions,
	useSendMessage,
} from "@yonder/ui-data";
import { ListFrame, MAIN_CONVERSATION, PageFrame } from "@yonder/ui-shell";
import { ArrowDown, Pin } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChatActions } from "./chat-actions/index.tsx";
import { ConversationMessages } from "./conversation-messages.tsx";
import { ConversationAvatar, conversationTitle, primaryConversation } from "./conversation-presentation.tsx";
import { messagePreview } from "./message-preview.ts";
import { useMessageScroll } from "./use-message-scroll.ts";

export function MessagesList({
	current,
	onOpen,
	onOpenMeetings,
}: {
	current: string | null;
	onOpen: (id: string) => void;
	onOpenMeetings?: () => void;
}) {
	const { t, i18n } = useTranslation();
	const bot = useBot();
	const conversations = useConversations();
	const person = usePerson();
	const primary = primaryConversation(conversations.data?.items, bot?.id);
	return (
		<ListFrame
			title={t("nav.messages")}
			action={<ChatActions onOpen={onOpen} {...(onOpenMeetings ? { onOpenMeetings } : {})} />}
		>
			{conversations.isError ? (
				<Button variant="link" onClick={() => void conversations.refetch()}>
					{t("app.retry")}
				</Button>
			) : null}
			<ConversationList label={t("nav.messages")}>
				{conversations.data?.items.map((conversation) => {
					const selected =
						current === conversation.id || (current === MAIN_CONVERSATION && conversation.id === primary?.id);
					return (
						<ConversationRow
							key={conversation.id}
							leading={<ConversationAvatar conversation={conversation} personId={person?.id} />}
							title={conversationTitle(conversation, person?.id)}
							preview={conversation.lastMessage?.body ? messagePreview(conversation.lastMessage.body) : undefined}
							meta={
								conversation.lastMessage?.createdAt
									? new Intl.DateTimeFormat(i18n.resolvedLanguage, { hour: "numeric", minute: "2-digit" }).format(
											new Date(conversation.lastMessage.createdAt),
										)
									: undefined
							}
							badge={
								conversation.pinned ? <Pin size={13} strokeWidth={2} aria-label={t("messages.pinned")} /> : undefined
							}
							selected={selected}
							onClick={() => onOpen(conversation.id === primary?.id ? MAIN_CONVERSATION : conversation.id)}
						/>
					);
				})}
			</ConversationList>
		</ListFrame>
	);
}

export function ConversationPage({
	conversationId,
	disconnected,
	onOpenMeeting,
}: {
	conversationId: string | null;
	disconnected: boolean;
	onOpenMeeting?: (id: string) => void;
}) {
	const { t } = useTranslation();
	const person = usePerson();
	const bot = useBot();
	const conversations = useConversations();
	const conversation = conversations.data?.items.find((item) => item.id === conversationId);
	const quota = useQuota();
	const messages = useMessages(conversationId);
	const actions = useRunActions();
	const send = useSendMessage(conversationId, person?.id);
	const items = useMemo(
		() =>
			messages.data?.pages
				.flatMap((page) => page.items)
				.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) as
				| CachedMessage[]
				| undefined,
		[messages.data],
	);
	const { bottom, showLatest, jumpToLatest } = useMessageScroll(conversationId, items);
	if (!conversationId || !conversation) return <PageFrame title={null}>{null}</PageFrame>;
	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<PageFrame title={conversationTitle(conversation, person?.id)} width="full">
				{quota.data && quota.data.balance <= 0 ? (
					<p
						role="status"
						className="rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] px-[var(--spacing-4)] py-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)]"
					>
						{t("chat.quotaExhausted")}
					</p>
				) : null}
				{messages.isLoading ? <p role="status">{t("chat.loadingHistory")}</p> : null}
				{messages.isError ? (
					<Button variant="link" onClick={() => void messages.refetch()}>
						{t("app.retry")}
					</Button>
				) : null}
				{!messages.isLoading && !messages.isError && items?.length === 0 ? (
					<div className="flex flex-1 items-center justify-center">
						<EmptyState
							icon={<ConversationAvatar conversation={conversation} personId={person?.id} />}
							title={t("chat.emptyTitle")}
						/>
					</div>
				) : null}
				{items?.length ? (
					<div
						className="mx-auto flex w-full max-w-[680px] flex-col gap-[var(--spacing-4)]"
						role="log"
						aria-label={t("nav.messages")}
					>
						{messages.hasNextPage ? (
							<Button size="sm" onClick={() => void messages.fetchNextPage()} loading={messages.isFetchingNextPage}>
								{t("chat.loadOlder")}
							</Button>
						) : null}
						<ConversationMessages
							items={items}
							conversation={conversation}
							person={person}
							bot={bot}
							disconnected={disconnected}
							retrying={actions.retry.isPending}
							{...(onOpenMeeting ? { onOpenMeeting } : {})}
							onResend={(message) =>
								send.mutate({
									type: "text",
									body: message.body ?? "",
									clientNonce: message.clientNonce ?? "",
									attachmentIds: message.attachments.map((attachment) => attachment.id),
									attachments: message.attachments,
									...(message.skillIds ? { skillIds: message.skillIds } : {}),
								})
							}
							onRetry={(id) => actions.retry.mutate(id)}
						/>
						<div ref={bottom} />
					</div>
				) : null}
			</PageFrame>
			{showLatest ? (
				<div className="absolute inset-x-0 bottom-[var(--spacing-4)] flex justify-center pointer-events-none">
					<Button size="sm" onClick={jumpToLatest} className="pointer-events-auto">
						<ArrowDown size={16} aria-hidden="true" />
						{t("chat.jumpToLatest")}
					</Button>
				</div>
			) : null}
		</div>
	);
}
