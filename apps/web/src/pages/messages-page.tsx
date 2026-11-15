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
import { Pin } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MessageContent } from "./message-content.tsx";
import { messagePreview } from "./message-preview.ts";

export function MessagesList({ current, onOpen }: { current: string | null; onOpen: (id: string) => void }) {
	const { t, i18n } = useTranslation();
	const bot = useBot();
	const conversations = useConversations();
	return (
		<ListFrame title={t("nav.messages")}>
			{conversations.isError ? (
				<Button variant="link" onClick={() => void conversations.refetch()}>
					{t("app.retry")}
				</Button>
			) : null}
			<ConversationList label={t("nav.messages")}>
				{conversations.data?.items.map((conversation, index) => {
					const member = conversation.members.find((item) => item.kind === "bot") ?? bot;
					if (!member) return null;
					const selected = current === conversation.id || (current === MAIN_CONVERSATION && index === 0);
					return (
						<ConversationRow
							key={conversation.id}
							leading={<Avatar name={member.displayName} src={member.avatarUrl} size={40} kind="bot" face={1} />}
							title={conversation.title ?? member.displayName}
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
							onClick={() => onOpen(index === 0 ? MAIN_CONVERSATION : conversation.id)}
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
}: {
	conversationId: string | null;
	disconnected: boolean;
}) {
	const { t } = useTranslation();
	const bot = useBot();
	const person = usePerson();
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
	const hasItems = Boolean(items?.length);
	const bottom = useRef<HTMLDivElement>(null);
	const follow = useRef(true);
	useEffect(() => {
		if (!conversationId || !hasItems) return;
		follow.current = true;
		const scroll = bottom.current?.closest(".overflow-y-auto");
		if (!scroll) return;
		const onScroll = () => {
			follow.current = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop < 96;
		};
		scroll.addEventListener("scroll", onScroll, { passive: true });
		return () => scroll.removeEventListener("scroll", onScroll);
	}, [conversationId, hasItems]);
	useEffect(() => {
		if (items?.length && follow.current) bottom.current?.scrollIntoView({ block: "end" });
	}, [items]);
	if (!conversationId || !bot) return <PageFrame title={null}>{null}</PageFrame>;
	return (
		<PageFrame title={bot.displayName} width="full">
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
						icon={<Avatar name={bot.displayName} src={bot.avatarUrl} size={48} kind="bot" face={1} />}
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
					{items.map((message) => (
						<article
							key={message.id}
							className={`flex flex-col gap-[var(--spacing-1)] ${message.senderKind === "person" ? "items-end" : "items-start"}`}
						>
							{message.body ? (
								<div className="max-w-full rounded-[var(--radius-card)] bg-[var(--color-bg-subtle)] px-[var(--spacing-4)] py-[var(--spacing-3)] text-body text-[var(--color-text-primary)]">
									<MessageContent body={message.body} />
								</div>
							) : null}
							{message.streaming && !message.body && !disconnected ? (
								<span role="status" className="text-caption text-[var(--color-text-secondary)]">
									{t("chat.streaming")}
								</span>
							) : null}
							{message.pending ? (
								<span className="text-caption text-[var(--color-text-secondary)]">{t("chat.sending")}</span>
							) : null}
							{message.sendFailed ? (
								<div
									role="alert"
									className="flex items-center gap-[var(--spacing-2)] text-caption text-[var(--color-danger)]"
								>
									{t("chat.sendFailed")}{" "}
									<Button
										variant="link"
										size="sm"
										onClick={() =>
											send.mutate({ type: "text", body: message.body ?? "", clientNonce: message.clientNonce ?? "" })
										}
									>
										{t("app.retry")}
									</Button>
								</div>
							) : null}
							{message.run?.status === "failed" ? (
								<div
									role="alert"
									className="flex items-center gap-[var(--spacing-2)] text-caption text-[var(--color-danger)]"
								>
									{t(
										message.run.failureReason === "model_not_configured" ? "chat.modelNotConfigured" : "chat.runFailed",
									)}{" "}
									<Button
										variant="link"
										size="sm"
										onClick={() => actions.retry.mutate(message.run?.userMessageId ?? "")}
										loading={actions.retry.isPending}
									>
										{t("app.retry")}
									</Button>
								</div>
							) : null}
						</article>
					))}
					<div ref={bottom} />
				</div>
			) : null}
		</PageFrame>
	);
}
