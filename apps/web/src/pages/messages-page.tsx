import { exhaustedPools, QuotaLowBanner } from "@yonder/feature-me";
import type { Conversation } from "@yonder/protocol";
import { Avatar, Button, ConversationList, ConversationRow, EmptyState } from "@yonder/ui-components";
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
import { useLocation, useNavigate } from "react-router";
import { ChatActions } from "./chat-actions/index.tsx";
import { ConversationMessages } from "./conversation-messages.tsx";
import {
	ConversationAvatar,
	conversationPeer,
	conversationTitle,
	primaryConversation,
} from "./conversation-presentation.tsx";
import { messagePreview } from "./message-preview.ts";
import { useMessageScroll } from "./use-message-scroll.ts";
import { VisitBar } from "./visit-bar.tsx";

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
								conversation.visit?.role === "host" && conversation.visit.state === "pending" ? (
									<span className="rounded-[var(--radius-control-sm)] bg-[var(--color-danger-subtle)] px-[var(--spacing-1)] text-micro text-[var(--color-danger)]">
										{t("visits.waitingForYou")}
									</span>
								) : conversation.pinned ? (
									<Pin size={13} strokeWidth={2} aria-label={t("messages.pinned")} />
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

/**
 * The chat header is the way into a member's page: a direct chat's avatar and name open the peer,
 * a group's title opens the group (17 3.1). Only a direct chat with one member gets the button.
 */
function chatHeader(conversation: Conversation, personId: string | undefined, onOpenMember?: (id: string) => void) {
	const title = conversationTitle(conversation, personId);
	const peer = conversation.kind === "direct" ? conversationPeer(conversation, personId) : undefined;
	if (!peer || !onOpenMember) return title;
	return (
		<button
			type="button"
			onClick={() => onOpenMember(peer.memberId)}
			className="flex min-w-0 items-center justify-center gap-[var(--spacing-2)] rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
		>
			<Avatar name={peer.displayName} src={peer.avatarUrl} color={peer.avatarColor} kind={peer.kind} size={24} />
			<span className="truncate">{title}</span>
		</button>
	);
}

export function ConversationPage({
	conversationId,
	disconnected,
	onOpenMeeting,
	onOpenMember,
}: {
	conversationId: string | null;
	disconnected: boolean;
	onOpenMeeting?: (id: string) => void;
	/** A member id; the frame decides whether it opens a profile or a Bot detail. */
	onOpenMember?: (memberId: string) => void;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
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
	// The 「我」 sections are a detail layer over the tab: leaving them returns to this chat, so the
	// tab's location travels with the push, as the frame does for its own 「我」 entries.
	const openSection = (target: string) => navigate(target, { state: { tabLocation: location.pathname } });
	if (!conversationId || !conversation) return <PageFrame title={null}>{null}</PageFrame>;
	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<PageFrame title={chatHeader(conversation, person?.id, onOpenMember)} width="full">
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
				) : quota.data ? (
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
