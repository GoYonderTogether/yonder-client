import {
	agentChatStatus,
	findPendingBotReply,
	isTwoPartyAgentChat,
	newestReadableMessage,
	ownedBotFor,
} from "@yonder/chat-model";
import { exhaustedPools, QuotaLowBanner } from "@yonder/feature-me";
import type { Conversation, Member } from "@yonder/protocol";
import {
	Button,
	ConversationList,
	ConversationRow,
	EmptyState,
	IconButton,
	Spinner,
	UnreadBadge,
} from "@yonder/ui-components";
import {
	type CachedMessage,
	useActiveBotSubtasks,
	useBot,
	useConversationListActions,
	useConversations,
	useMarkConversationRead,
	useMessages,
	usePerson,
	useQuota,
	useRunActions,
	useSendMessage,
} from "@yonder/ui-data";
import { ConfirmDialog, ListFrame, MAIN_CONVERSATION, PageFrame, useShellChrome } from "@yonder/ui-shell";
import { ArrowDown, Ellipsis, Pin, PinOff, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { isForeground, useForeground } from "../lib/foreground.ts";
import { BotWaitingBubble } from "./bot-waiting-bubble.tsx";
import { ChatActions } from "./chat-actions/index.tsx";
import { ConversationAgentHeader } from "./conversation-agent-header.tsx";
import {
	ConversationAvatar,
	conversationPeer,
	conversationTitle,
	primaryConversation,
} from "./conversation-presentation.tsx";
import { ConversationEntry } from "./conversation-row.tsx";
import { InteractiveConversationMessages } from "./message-action-dialogs.tsx";
import { useMessageQuoteJump } from "./use-message-quote-jump.ts";
import { useMessageScroll } from "./use-message-scroll.ts";
import { VisitBar } from "./visit-bar.tsx";

export function MessagesList({
	current,
	contacts,
	onOpen,
	acceptImageDrop = false,
	onOpenVisits,
	incoming = false,
	visitsSelected = false,
	onOpenMeetings,
}: {
	current: string | null;
	contacts?: readonly Member[] | undefined;
	onOpen: (id: string, drop?: { conversationId: string; files: File[] }) => void;
	acceptImageDrop?: boolean;
	onOpenVisits?: () => void;
	incoming?: boolean;
	visitsSelected?: boolean;
	onOpenMeetings?: () => void;
}) {
	const { t, i18n } = useTranslation();
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
	const visits = visible?.filter((conversation) => conversation.visit?.role === "host");
	const visitUnread = visits?.some((visit) => visit.unreadCount > 0) ? 1 : 0;
	const label = t(incoming ? "visits.incoming" : "nav.messages");
	const openEntry = (conversation: Conversation, files?: File[]) =>
		onOpen(
			conversation.id === primary?.id ? MAIN_CONVERSATION : conversation.id,
			files ? { conversationId: conversation.id, files } : undefined,
		);
	const showEntry = (conversation: Conversation) => (
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
						const title =
							conversation.kind === "system"
								? t("friendRequests.notifications")
								: conversationTitle(conversation, person?.id);
						setDeleting({ id: conversation.id, title });
					},
					disabled: busy,
				},
			]}
			onOpen={() => openEntry(conversation)}
			onDropImages={
				acceptImageDrop &&
				conversation.kind !== "system" &&
				!conversation.closedReason &&
				conversation.visit?.role !== "host"
					? (files) => openEntry(conversation, files)
					: undefined
			}
		/>
	);
	return (
		<ListFrame
			title={!incoming && mode === "mobile" ? "" : label}
			action={incoming ? null : <ChatActions onOpen={onOpen} {...(onOpenMeetings ? { onOpenMeetings } : {})} />}
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
			<ConversationList label={label}>
				{incoming
					? visits?.map(showEntry)
					: visible?.filter((conversation) => conversation.visit?.role !== "host").map(showEntry)}
				{incoming && visits?.length === 0 ? (
					<EmptyState as="li" variant="inline" title={t("visits.incomingEmpty")} />
				) : null}
				{!incoming && visits?.length && onOpenVisits ? (
					<ConversationRow
						leading={<ConversationAvatar conversation="inbox" />}
						title={t("visits.incoming")}
						preview={t("messages.muted")}
						badge={<UnreadBadge count={visitUnread} muted label={t("visits.incomingUnread")} />}
						selected={visitsSelected}
						onClick={onOpenVisits}
					/>
				) : null}
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

export function ConversationPage({
	conversationId,
	disconnected,
	mainBotHome = false,
	readActive = true,
	contacts,
	onOpenMeeting,
	onOpenMember,
	onOpenGroup,
	onMention,
	item,
}: {
	conversationId: string | null;
	disconnected: boolean;
	mainBotHome?: boolean;
	readActive?: boolean;
	contacts?: readonly Member[] | undefined;
	onOpenMeeting?: (id: string) => void;
	onOpenMember?: (memberId: string) => void;
	onOpenGroup?: () => void;
	onMention?: ((memberId: string, displayName: string) => void) | undefined;
	item?: {
		conversation: Conversation;
		title: ReactNode;
		action: ReactNode;
		intro: ReactNode;
	};
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const { mode } = useShellChrome();
	const openItem = onOpenMeeting ?? (item ? (id: string) => navigate(`/tasks/${encodeURIComponent(id)}`) : undefined);
	const person = usePerson();
	const bot = useBot();
	const conversations = useConversations();
	const conversation = item?.conversation ?? conversations.data?.items.find((item) => item.id === conversationId);
	const peer = conversation?.kind === "direct" ? conversationPeer(conversation, person?.id) : undefined;
	const agent = peer?.kind === "bot" ? peer : undefined;
	const ownedAgent = agent && ownedBotFor(agent.memberId, person?.id, bot, contacts);
	const mainBotHeader = mainBotHome && (!conversation || Boolean(agent));
	const mobileBotHeader = mode === "mobile" && Boolean(agent && !item);
	const floatingHeader = mainBotHeader || Boolean(agent && !item);
	const showAgentIdentity = Boolean(agent && (!item || mode !== "mobile"));
	const { data: subtasks } = useActiveBotSubtasks(
		item || conversation?.visit?.role === "visitor" ? undefined : agent?.memberId,
	);
	const quota = useQuota();
	const messages = useMessages(conversationId);
	const { fetchNextPage } = messages;
	const loadEarlier = useCallback(() => void fetchNextPage({ cancelRefetch: false }), [fetchNextPage]);
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
	const { bottom, showLatest, newCount, atBottom, atLatest, canReadLatest, jumpToLatest } = useMessageScroll(
		conversationId,
		items,
		readActive && messages.hasNextPage && !messages.isFetching && !messages.isFetchNextPageError
			? loadEarlier
			: undefined,
		person?.id,
	);
	const jumpToQuote = useMessageQuoteJump(bottom, messages);
	const foreground = useForeground();
	const canRead = useCallback(() => isForeground() && canReadLatest(), [canReadLatest]);
	useMarkConversationRead(
		person?.id,
		conversationId,
		readActive &&
			foreground &&
			atLatest &&
			!disconnected &&
			messages.isFetchedAfterMount &&
			!messages.isFetching &&
			person &&
			items?.length &&
			(item || conversation?.unreadCount)
			? newestReadableMessage(items, person.id, {
					agentCards: true,
					recordingNotes: Boolean(openItem),
					taskSessions: Boolean(openItem),
				})
			: undefined,
		canRead,
	);
	// The 「我」 sections are a detail layer over the tab: leaving them returns to this chat, so the
	// tab's location travels with the push, as the frame does for its own 「我」 entries.
	const openSection = (target: string) => navigate(target, { state: { tabLocation: location.pathname } });
	if (!conversationId || !conversation)
		return (
			<PageFrame title={null} floatingHeader={floatingHeader} conversationHeader>
				{null}
			</PageFrame>
		);
	const title =
		conversation.kind === "system"
			? t("friendRequests.notifications")
			: peer?.displayName || conversationTitle(conversation, person?.id);
	const showReplyDots = Boolean(
		person &&
			agent &&
			!conversation.visit &&
			isTwoPartyAgentChat(conversation, person.id) &&
			(item || ownedAgent) &&
			findPendingBotReply(items, agent.memberId, person.id),
	);
	const status = agent && !disconnected ? agentChatStatus(items, agent.memberId, subtasks) : undefined;
	const statusText =
		status?.kind === "processing"
			? t("chat.agentStatus.processing", { titles: status.titles.join(t("chat.agentStatus.separator")) })
			: status?.kind === "typing"
				? t("chat.agentStatus.typing")
				: undefined;
	const openPeer = peer && onOpenMember ? () => onOpenMember(peer.memberId) : undefined;
	const openSettings = conversation.kind === "group" ? onOpenGroup : openPeer;

	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<PageFrame
				floatingHeader={floatingHeader}
				conversationHeader
				title={item ? item.title : agent ? null : title}
				titleAlign={agent && !item ? "center" : "start"}
				afterTopBar={
					agent && showAgentIdentity ? (
						<ConversationAgentHeader
							agent={agent}
							conversation={conversation}
							ownedAgent={ownedAgent}
							title={title}
							statusText={statusText}
							working={showReplyDots}
							onOpen={mobileBotHeader ? openPeer : undefined}
						/>
					) : null
				}
				action={
					item ? (
						item.action
					) : openSettings ? (
						<IconButton
							aria-label={t("chat.settings")}
							aria-haspopup="dialog"
							title={t("chat.settings")}
							onClick={openSettings}
						>
							<Ellipsis size={20} aria-hidden="true" />
						</IconButton>
					) : undefined
				}
				width="full"
			>
				<VisitBar conversation={conversation} />
				{conversation.visit?.role === "visitor" &&
				conversation.visit.state === "self_pay" &&
				quota.data &&
				exhaustedPools(quota.data).length > 0 ? (
					// A visitor paying from their own balance is told that balance is what ran out.
					<p
						role="status"
						className="rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] px-[var(--spacing-4)] py-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)]"
					>
						{t("visits.selfPayQuota")}
					</p>
				) : quota.data && conversation.kind !== "system" ? (
					<QuotaLowBanner
						quota={quota.data}
						onOpenInvite={() => openSection("/me/invite")}
						onOpenUsage={() => openSection("/me/quota")}
					/>
				) : null}
				{messages.isLoading ? <p role="status">{t("chat.loadingHistory")}</p> : null}
				{messages.isError && !messages.isFetchNextPageError ? (
					<Button variant="link" onClick={() => void messages.refetch()}>
						{t("app.retry")}
					</Button>
				) : null}
				{!item?.intro && !messages.isLoading && !messages.isError && items?.length === 0 ? (
					<div className="flex flex-1 items-center justify-center">
						<EmptyState
							icon={item || agent ? null : <ConversationAvatar conversation={conversation} personId={person?.id} />}
							title={t("chat.emptyTitle")}
						/>
					</div>
				) : null}
				{item?.intro || items?.length ? (
					<div
						className="mx-auto flex w-full max-w-[680px] flex-col gap-[var(--spacing-4)] [&_[data-message-highlighted]]:outline [&_[data-message-highlighted]]:outline-offset-[var(--spacing-1)] [&_[data-message-highlighted]]:outline-[var(--color-accent)]"
						role="log"
						aria-label={t("nav.messages")}
					>
						{!messages.hasNextPage ? item?.intro : null}
						{messages.hasNextPage ? (
							<div className="flex min-h-[var(--icon-sm)] justify-center text-[var(--color-text-secondary)]">
								{messages.isFetchingNextPage ? (
									<Spinner size="sm" label={t("chat.loadingEarlier")} />
								) : messages.isFetchNextPageError ? (
									<Button size="sm" variant="link" onClick={loadEarlier}>
										{t("chat.retryEarlier")}
									</Button>
								) : null}
							</div>
						) : null}
						{items?.length ? (
							<InteractiveConversationMessages
								items={items}
								hasFullHistory={!messages.hasNextPage}
								conversation={conversation}
								person={person}
								bot={bot}
								contacts={contacts}
								disconnected={disconnected}
								retrying={actions.retry.isPending}
								onOpenRelated={(id) => navigate(`/messages/${encodeURIComponent(id)}`)}
								onOpenMember={onOpenMember}
								onMention={onMention}
								onJumpToQuote={jumpToQuote}
								{...(openItem ? { onOpenMeeting: openItem } : {})}
								onResend={(message) =>
									send.mutate({
										type: message.sendType ?? "text",
										body: message.body ?? "",
										clientNonce: message.clientNonce ?? "",
										attachmentIds: message.attachments.map((attachment) => attachment.id),
										attachments: message.attachments,
										...(message.replyToId ? { replyToId: message.replyToId } : {}),
										...(message.replyTo ? { replyTo: message.replyTo } : {}),
										...(message.voice ? { voice: message.voice } : {}),
										...(message.skillIds ? { skillIds: message.skillIds } : {}),
										...(message.mentionedMemberIds ? { mentionedMemberIds: message.mentionedMemberIds } : {}),
									})
								}
								onRetry={(id) => actions.retry.mutate(id)}
								onChooseOption={
									send.isPending
										? undefined
										: (body, id) => send.mutate({ type: "text", body, clientNonce: `option:${id}` })
								}
							/>
						) : null}
						{showReplyDots ? <BotWaitingBubble /> : null}
						<div ref={bottom} className="h-px shrink-0" />
					</div>
				) : null}
			</PageFrame>
			{showLatest || (items?.length && conversation.unreadCount > 0 && !atBottom) ? (
				<div className="absolute inset-x-0 bottom-[calc(var(--native-dock-height,0px)_+_var(--spacing-4))] flex justify-center pointer-events-none">
					<Button
						data-chat-jump-latest
						{...(newCount > 0 ? {} : { "aria-label": t("chat.jumpToLatest") })}
						variant="secondary"
						size="sm"
						onClick={jumpToLatest}
						className="pointer-events-auto rounded-[var(--radius-full)]! bg-[var(--color-bg-raised)]! [box-shadow:var(--shadow-app-icon)]"
					>
						<ArrowDown size={16} aria-hidden="true" />
						{newCount > 0 ? <span>{t("chat.newMessages", { count: newCount })}</span> : null}
					</Button>
				</div>
			) : null}
		</div>
	);
}
