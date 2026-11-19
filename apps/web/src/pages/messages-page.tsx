import { agentChatStatus, newestReadableMessage } from "@yonder/chat-model";
import { exhaustedPools, QuotaLowBanner } from "@yonder/feature-me";
import { systemEventText, type Translate } from "@yonder/feature-members";
import type { Conversation } from "@yonder/protocol";
import { Avatar, Button, ConversationList, ConversationRow, EmptyState, IconButton } from "@yonder/ui-components";
import {
	type CachedMessage,
	useActiveBotSubtasks,
	useBot,
	useConversations,
	useMarkConversationRead,
	useMessages,
	usePerson,
	useQuota,
	useRunActions,
	useSendMessage,
} from "@yonder/ui-data";
import { ListFrame, MAIN_CONVERSATION, PageFrame, useShellChrome } from "@yonder/ui-shell";
import { ArrowDown, BellOff, Ellipsis, Pin } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { useForeground } from "../lib/foreground.ts";
import { ChatActions } from "./chat-actions/index.tsx";
import { ConversationMessages } from "./conversation-messages.tsx";
import {
	ConversationAvatar,
	conversationPeer,
	conversationTitle,
	primaryConversation,
} from "./conversation-presentation.tsx";
import { messagePreview } from "./message-preview.ts";
import { UnreadBadge } from "./unread-badge.tsx";
import { useMessageScroll } from "./use-message-scroll.ts";
import { VisitBar } from "./visit-bar.tsx";

/**
 * A group lifecycle message stores an event, not a sentence, so the row builds its words here in
 * the reader's language (19 3.3); every other last message keeps the ordinary preview.
 */
function rowPreview(conversation: Conversation, t: Translate): string | undefined {
	const last = conversation.lastMessage;
	if (!last) return undefined;
	if (conversation.kind === "system") return t("friendRequests.title");
	if (last.type === "system" && last.system) return systemEventText(last.system, t) || undefined;
	if (last.voice) return t("chat.voiceMessage");
	return last.body ? messagePreview(last.body) : undefined;
}

export function MessagesList({
	current,
	hidePrimary = false,
	onOpen,
	onOpenMeetings,
}: {
	current: string | null;
	hidePrimary?: boolean;
	onOpen: (id: string) => void;
	onOpenMeetings?: () => void;
}) {
	const { t, i18n } = useTranslation();
	const { mode } = useShellChrome();
	const bot = useBot();
	const conversations = useConversations();
	const person = usePerson();
	const primary = primaryConversation(conversations.data?.items, bot?.id);
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
			<ConversationList label={t("nav.messages")}>
				{conversations.data?.items
					.filter((conversation) => !hidePrimary || conversation.id !== primary?.id)
					.map((conversation) => {
						const selected =
							current === conversation.id || (current === MAIN_CONVERSATION && conversation.id === primary?.id);
						return (
							<ConversationRow
								key={conversation.id}
								leading={<ConversationAvatar conversation={conversation} personId={person?.id} />}
								title={
									conversation.kind === "system"
										? t("friendRequests.notifications")
										: conversationTitle(conversation, person?.id)
								}
								preview={rowPreview(conversation, t)}
								meta={
									conversation.lastMessage?.createdAt
										? new Intl.DateTimeFormat(i18n.resolvedLanguage, { hour: "numeric", minute: "2-digit" }).format(
												new Date(conversation.lastMessage.createdAt),
											)
										: undefined
								}
								badge={
									conversation.unreadCount ||
									conversation.muted ||
									conversation.pinned ||
									(conversation.visit?.role === "host" && conversation.visit.state === "pending") ? (
										<span className="flex items-center gap-[var(--spacing-1)]">
											{conversation.visit?.role === "host" && conversation.visit.state === "pending" ? (
												<span className="rounded-[var(--radius-control-sm)] bg-[var(--color-danger-subtle)] px-[var(--spacing-1)] text-micro text-[var(--color-danger)]">
													{t("visits.waitingForYou")}
												</span>
											) : null}
											{conversation.pinned ? <Pin size={13} aria-label={t("messages.pinned")} /> : null}
											{conversation.muted ? <BellOff size={13} aria-label={t("messages.muted")} /> : null}
											<UnreadBadge count={conversation.unreadCount} />
										</span>
									) : undefined
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
	embedded = false,
	mobileBotHome = false,
	readActive = true,
	onOpenMeeting,
	onOpenMember,
	onOpenGroup,
}: {
	conversationId: string | null;
	disconnected: boolean;
	embedded?: boolean;
	mobileBotHome?: boolean;
	readActive?: boolean;
	onOpenMeeting?: (id: string) => void;
	/** A member id; the frame decides whether it opens a profile or a Bot detail. */
	onOpenMember?: (memberId: string) => void;
	/** Opens settings for a group conversation. */
	onOpenGroup?: () => void;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const person = usePerson();
	const bot = useBot();
	const conversations = useConversations();
	const conversation = conversations.data?.items.find((item) => item.id === conversationId);
	const peer = conversation?.kind === "direct" ? conversationPeer(conversation, person?.id) : undefined;
	const agent = peer?.kind === "bot" ? peer : undefined;
	const { data: subtasks } = useActiveBotSubtasks(
		conversation?.visit?.role === "visitor" ? undefined : agent?.memberId,
	);
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
	const { bottom, showLatest, atLatest, jumpToLatest } = useMessageScroll(conversationId, items);
	const foreground = useForeground();
	useMarkConversationRead(
		person?.id,
		conversationId,
		readActive && foreground && atLatest && !disconnected && person && items?.length && conversation?.unreadCount
			? newestReadableMessage(items, person.id)
			: undefined,
	);
	// The 「我」 sections are a detail layer over the tab: leaving them returns to this chat, so the
	// tab's location travels with the push, as the frame does for its own 「我」 entries.
	const openSection = (target: string) => navigate(target, { state: { tabLocation: location.pathname } });
	if (!conversationId || !conversation)
		return (
			<PageFrame title={null} hideHeader={embedded} floatingHeader={mobileBotHome}>
				{null}
			</PageFrame>
		);
	const title =
		conversation.kind === "system"
			? t("friendRequests.notifications")
			: peer?.displayName || conversationTitle(conversation, person?.id);
	const status = agent && !disconnected ? agentChatStatus(items, agent.memberId, subtasks) : undefined;
	const statusText =
		status?.kind === "processing"
			? t("chat.agentStatus.processing", { titles: status.titles.join(t("chat.agentStatus.separator")) })
			: status?.kind === "typing"
				? t("chat.agentStatus.typing")
				: undefined;
	const openPeer = peer && onOpenMember ? () => onOpenMember(peer.memberId) : undefined;
	const openSettings = conversation.kind === "group" ? onOpenGroup : openPeer;
	const agentAvatar = agent && (
		<Avatar name={title} src={agent.avatarUrl} color={agent.avatarColor} kind="bot" size={48} />
	);
	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<PageFrame
				hideHeader={embedded}
				floatingHeader={mobileBotHome}
				title={agent ? null : title}
				titleAlign={agent ? "center" : "start"}
				afterTopBar={
					agent ? (
						<section
							data-chat-agent-title
							aria-label={title}
							className="flex flex-col items-center gap-[var(--spacing-1)] px-[var(--spacing-4)]"
						>
							{mobileBotHome && openPeer ? (
								<Button
									variant="ghost"
									size="lg"
									className="px-0"
									aria-label={t("bots.settings")}
									aria-haspopup="dialog"
									onClick={openPeer}
								>
									{agentAvatar}
								</Button>
							) : (
								agentAvatar
							)}
							<div
								data-chat-agent-name
								className="max-w-[75%] text-body font-medium text-[var(--color-text-primary)]"
								title={title}
							>
								<span className="block truncate">{title}</span>
							</div>
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
					openSettings && !mobileBotHome ? (
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
				{messages.isError ? (
					<Button variant="link" onClick={() => void messages.refetch()}>
						{t("app.retry")}
					</Button>
				) : null}
				{!messages.isLoading && !messages.isError && items?.length === 0 ? (
					<div className="flex flex-1 items-center justify-center">
						<EmptyState
							icon={
								agent && !embedded ? null : <ConversationAvatar conversation={conversation} personId={person?.id} />
							}
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
							hasFullHistory={!messages.hasNextPage}
							conversation={conversation}
							person={person}
							bot={bot}
							disconnected={disconnected}
							retrying={actions.retry.isPending}
							onOpenRelated={(id) => navigate(`/messages/${encodeURIComponent(id)}`)}
							onOpenMember={onOpenMember}
							{...(onOpenMeeting ? { onOpenMeeting } : {})}
							onResend={(message) =>
								send.mutate({
									type: "text",
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
							onChooseOption={(body, id) => {
								if (!send.isPending) send.mutate({ type: "text", body, clientNonce: `option:${id}` });
							}}
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
