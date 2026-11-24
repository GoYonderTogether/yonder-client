import {
	agentChatStatus,
	conversationBotOwner,
	hasPendingBotReply,
	isTwoPartyAgentChat,
	newestReadableMessage,
	ownedBotFor,
} from "@yonder/chat-model";
import { exhaustedPools, QuotaLowBanner } from "@yonder/feature-me";
import { BotName } from "@yonder/feature-members";
import type { Conversation, Member } from "@yonder/protocol";
import { Avatar, Button, ConversationList, EmptyState, IconButton, Spinner } from "@yonder/ui-components";
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
import { ConversationMessages } from "./conversation-messages.tsx";
import {
	ConversationAvatar,
	conversationPeer,
	conversationTitle,
	primaryConversation,
} from "./conversation-presentation.tsx";
import { ConversationEntry } from "./conversation-row.tsx";
import { useMessageScroll } from "./use-message-scroll.ts";
import { VisitBar } from "./visit-bar.tsx";

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

export function ConversationPage({
	conversationId,
	disconnected,
	mainBotHome = false,
	readActive = true,
	contacts,
	onOpenMeeting,
	onOpenMember,
	onOpenGroup,
	item,
}: {
	conversationId: string | null;
	disconnected: boolean;
	mainBotHome?: boolean;
	readActive?: boolean;
	contacts?: readonly Member[] | undefined;
	onOpenMeeting?: (id: string) => void;
	/** A member id; the frame decides whether it opens a profile or a Bot detail. */
	onOpenMember?: (memberId: string) => void;
	/** Opens settings for a group conversation. */
	onOpenGroup?: () => void;
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
	const person = usePerson();
	const bot = useBot();
	const conversations = useConversations();
	const conversation = item?.conversation ?? conversations.data?.items.find((item) => item.id === conversationId);
	const peer = conversation?.kind === "direct" ? conversationPeer(conversation, person?.id) : undefined;
	const agent = peer?.kind === "bot" ? peer : undefined;
	const mainBotHeader = mainBotHome && (!conversation || Boolean(agent));
	const mobileBotHome = mainBotHeader && mode === "mobile";
	const mobileBotHeader = mode === "mobile" && Boolean(agent && !item);
	const floatingHeader = mainBotHeader || Boolean(agent && !item);
	const showAgentIdentity = Boolean(agent && (!item || mode !== "mobile"));
	const { data: subtasks } = useActiveBotSubtasks(
		item || conversation?.visit?.role === "visitor" ? undefined : agent?.memberId,
	);
	const quota = useQuota();
	const messages = useMessages(conversationId, mobileBotHome || Boolean(item || conversation?.unreadCount));
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
	const { bottom, showLatest, atBottom, atLatest, canReadLatest, jumpToLatest } = useMessageScroll(
		conversationId,
		items,
		readActive && messages.hasNextPage && !messages.isFetching && !messages.isFetchNextPageError
			? loadEarlier
			: undefined,
	);
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
					recordingNotes: Boolean(onOpenMeeting),
					taskSessions: Boolean(onOpenMeeting),
				})
			: undefined,
		canRead,
	);
	// The 「我」 sections are a detail layer over the tab: leaving them returns to this chat, so the
	// tab's location travels with the push, as the frame does for its own 「我」 entries.
	const openSection = (target: string) => navigate(target, { state: { tabLocation: location.pathname } });
	if (!conversationId || !conversation)
		// HEAD's floating agent header needs the conversation header treatment on both branches.
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
			(item || ((conversation.isPrimary ?? mainBotHome) && agent.memberId === bot?.id)) &&
			hasPendingBotReply(items, agent.memberId, person.id),
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
	const clickableIdentity = mobileBotHeader && openPeer;
	const Identity = clickableIdentity ? "button" : "div";
	const agentAvatar = agent && showAgentIdentity && (
		<Avatar
			name={title}
			src={agent.avatarUrl}
			color={agent.avatarColor}
			kind="bot"
			size={48}
			className="rounded-[var(--radius-full)]!"
		/>
	);
	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<PageFrame
				floatingHeader={floatingHeader}
				conversationHeader
				title={item ? item.title : agent ? null : title}
				titleAlign={agent && !item ? "center" : "start"}
				afterTopBar={
					agent && showAgentIdentity ? (
						<section
							data-chat-agent-title
							aria-label={title}
							className="flex flex-col items-center gap-[var(--spacing-1)] px-[var(--spacing-4)]"
						>
							<Identity
								data-chat-agent-identity={clickableIdentity ? true : undefined}
								className={
									clickableIdentity
										? "flex w-fit max-w-[75%] flex-col items-center gap-[var(--spacing-1)] rounded-[var(--radius-full)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
										: "contents"
								}
								{...(clickableIdentity
									? {
											type: "button",
											"aria-label": t("bots.settings"),
											"aria-haspopup": "dialog" as const,
											onClick: openPeer,
										}
									: {})}
							>
								<span data-chat-agent-avatar className="flex">
									{agentAvatar}
								</span>
								<span
									data-chat-agent-name
									className={`w-fit ${clickableIdentity ? "max-w-full" : "max-w-[75%]"} text-center text-body font-medium text-[var(--color-text-primary)]`}
									title={title}
								>
									<BotName
										name={title}
										ownedBot={ownedBotFor(agent.memberId, person?.id, bot, contacts)}
										owner={conversationBotOwner(agent, conversation)}
										compact="header"
									/>
								</span>
							</Identity>
							{statusText ? (
								<div
									role="status"
									className="max-w-full text-center text-caption text-[var(--color-text-secondary)]"
									title={statusText}
								>
									<span className="line-clamp-2 wrap-anywhere">{statusText}</span>
								</div>
							) : null}
						</section>
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
						className="mx-auto flex w-full max-w-[680px] flex-col gap-[var(--spacing-4)]"
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
							<ConversationMessages
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
								{...(onOpenMeeting ? { onOpenMeeting } : {})}
								onResend={(message) =>
									send.mutate({
										type: message.sendType ?? "text",
										body: message.body ?? "",
										clientNonce: message.clientNonce ?? "",
										attachmentIds: message.attachments.map((attachment) => attachment.id),
										attachments: message.attachments,
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
					<IconButton
						data-chat-jump-latest
						aria-label={t("chat.jumpToLatest")}
						variant="secondary"
						onClick={jumpToLatest}
						className="pointer-events-auto rounded-[var(--radius-full)]! bg-[var(--color-bg-raised)]! [box-shadow:var(--shadow-app-icon)]"
					>
						<ArrowDown size={16} aria-hidden="true" />
					</IconButton>
				</div>
			) : null}
		</div>
	);
}
