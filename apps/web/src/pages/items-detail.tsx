import { MessageBubble, MessageRun, SystemNotice } from "@yonder/chat-presentation";
import type { ItemDetail } from "@yonder/protocol";
import { Button, EmptyState } from "@yonder/ui-components";
import { ApiError, useAccountTimeZone, useItem, useItemActions, type useItemSession } from "@yonder/ui-data";
import { PageFrame } from "@yonder/ui-shell";
import { formatInstant } from "@yonder/ui-time";
import { Ellipsis, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ItemMeetingCard } from "./item-meeting-card.tsx";
import { ItemSessionTitle } from "./item-session-title.tsx";
import {
	itemActions,
	itemFailure,
	itemGroup,
	itemPause,
	itemTimeLabel,
	itemTrailingKey,
	itemWaitingText,
	localDay,
} from "./items-format.ts";
import { ItemStatusIcon } from "./items-status.tsx";
import { MessageContent } from "./message-content.tsx";
import { ConversationPage } from "./messages-page.tsx";
import { OutwardRequestCard } from "./outward-request-card.tsx";

export function ItemDetailPage({
	itemId,
	session,
	disconnected,
	readActive,
	onOpenConversation,
}: {
	itemId: string;
	session: ReturnType<typeof useItemSession>;
	disconnected: boolean;
	readActive: boolean;
	onOpenConversation: (id: string) => void;
}) {
	const { t, i18n } = useTranslation();
	const query = useItem(itemId);
	const actions = useItemActions();
	const item = query.data;
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const zone = useAccountTimeZone();
	if (!item)
		return (
			<PageFrame title={t("tasks.itemHeading")}>
				{query.isError ? (
					<EmptyState
						icon={<ListChecks size={24} strokeWidth={1.6} />}
						title={
							query.error instanceof ApiError && query.error.code === "not_found"
								? t("tasks.itemNotFound")
								: t("app.loadFailed")
						}
						action={
							<Button variant="secondary" onClick={() => void query.refetch()}>
								{t("app.retry")}
							</Button>
						}
					/>
				) : (
					<p role="status" className="text-center text-caption text-[var(--color-text-secondary)]">
						{t("app.loading")}
					</p>
				)}
			</PageFrame>
		);

	const canRename = Boolean(session.data) && (item.source === "meeting" || item.source === "conversation");
	const title = <ItemHeader item={item} locale={locale} zone={zone} t={t} canRename={canRename && !disconnected} />;
	const allowed = itemActions(item);
	const busy = actions.cancel.isPending;
	/**
	 * Meta Muse is the reference (2026-11-24): a running item can be stopped; pausing, resuming and
	 * handing off are the Bot's own tools, told in chat.
	 */
	const action = allowed.cancel ? (
		<details className="relative z-10">
			<summary
				aria-label={t("tasks.itemActions")}
				className="flex size-[var(--control-md)] cursor-pointer list-none items-center justify-center rounded-[var(--radius-full)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] [&::-webkit-details-marker]:hidden"
			>
				<Ellipsis size={20} aria-hidden="true" />
			</summary>
			<div className="absolute end-0 top-full flex min-w-max flex-col gap-[var(--spacing-2)] rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-raised)] p-[var(--spacing-3)] shadow-[var(--shadow-lg)]">
				<Button variant="danger" size="sm" disabled={busy} onClick={() => actions.cancel.mutate(item.id)}>
					{t("tasks.itemCancel")}
				</Button>
			</div>
		</details>
	) : null;
	const actionError = actions.cancel.isError ? "tasks.itemCancelFailed" : null;
	const reason = actions.cancel.error;
	const hasSeed =
		item.source !== "conversation" &&
		(item.source === "meeting" || item.instruction || item.outwardRequest || item.failureReason || item.result);
	const conversationFailure = item.source === "conversation" && item.state === "failed" && item.failureReason;
	const intro =
		hasSeed || actionError || conversationFailure ? (
			<>
				{actionError ? (
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{t(actionError)}
						{reason instanceof ApiError ? ` ${t(reason.messageKey)}` : null}
					</p>
				) : null}
				{hasSeed ? <ItemIntroduction item={item} onOpenConversation={onOpenConversation} /> : null}
				{conversationFailure ? <ItemFailureNotice reason={conversationFailure} /> : null}
			</>
		) : null;
	const conversation = session.data?.conversation;

	return conversation ? (
		<ConversationPage
			key={conversation.id}
			conversationId={conversation.id}
			disconnected={disconnected}
			readActive={readActive}
			item={{ conversation, title, action, intro }}
		/>
	) : (
		<PageFrame title={title} titleAlign="start" action={action}>
			<div className="flex flex-col gap-[var(--spacing-4)]">
				{intro}
				{session.isError ? (
					<EmptyState
						icon={<ListChecks size={24} strokeWidth={1.6} />}
						title={t("app.loadFailed")}
						action={
							<Button variant="secondary" onClick={() => void session.refetch()}>
								{t("app.retry")}
							</Button>
						}
					/>
				) : (
					<p role="status" className="text-center text-caption text-[var(--color-text-secondary)]">
						{t("chat.loadingHistory")}
					</p>
				)}
			</div>
		</PageFrame>
	);
}

function ItemHeader({
	item,
	locale,
	zone,
	t,
	canRename,
}: {
	item: ItemDetail;
	locale: string;
	/** The account's zone: the header's clock and its day are both read in it. */
	zone: string;
	t: ReturnType<typeof useTranslation>["t"];
	canRename: boolean;
}) {
	const date = (iso: string) => formatInstant(iso, { zone, locale, style: "date", width: "long", year: "always" });
	const start = new Date(item.startedAt);
	const end = item.endedAt ? new Date(item.endedAt) : null;
	const group = itemGroup(item.startedAt, new Date(), zone);
	const day =
		group === "earlier" ? date(item.startedAt) : t(group === "today" ? "tasks.itemsToday" : "tasks.itemsYesterday");
	const started = itemTimeLabel(item.startedAt, locale, zone);
	const ended = item.endedAt ? itemTimeLabel(item.endedAt, locale, zone) : null;
	const endDay = end && localDay(end, zone) !== localDay(start, zone) ? date(item.endedAt as string) : null;
	const word = itemTrailingKey(item);
	// The same mark the list uses (2026-11-26), so one item reads the same in both places. The
	// header writes the state out in words, so the mark itself is decorative here.
	const status = (
		<span className="shrink-0">
			<ItemStatusIcon item={item} size={14} named={false} />
		</span>
	);
	const reason =
		item.state === "failed" && item.failureReason
			? itemFailure(item.failureReason, locale).text
			: item.state === "paused"
				? itemPause(item.failureReason, locale)
				: item.state === "waiting_user"
					? itemWaitingText(item, item.title, locale)
					: null;
	return (
		<div className="flex min-w-0 flex-col gap-[calc(var(--spacing-1)/2)]">
			<ItemSessionTitle key={item.id} id={item.id} title={item.title} canRename={canRename} />
			<div className="flex min-w-0 items-center gap-[var(--spacing-1)] text-caption font-normal text-[var(--color-text-secondary)]">
				{status}
				{word ? (
					<>
						<span className="shrink-0">{t(word)}</span>
						<span aria-hidden="true">·</span>
					</>
				) : null}
				<span className="min-w-0 truncate">
					{reason ? <span>{reason}</span> : null}
					{reason ? <span aria-hidden="true"> · </span> : null}
					<time
						dateTime={item.startedAt}
						title={t("tasks.itemStartedAt", { at: `${date(item.startedAt)} ${started}` })}
					>
						{day} {started}
					</time>
					{item.endedAt && end && ended ? (
						<>
							<span aria-hidden="true"> – </span>
							<time
								dateTime={item.endedAt}
								title={t("tasks.itemEndedAt", { at: `${date(item.endedAt as string)} ${ended}` })}
							>
								{endDay ? `${endDay} ` : ""}
								{ended}
							</time>
						</>
					) : null}
				</span>
			</div>
		</div>
	);
}

function ItemIntroduction({
	item,
	onOpenConversation,
}: {
	item: ItemDetail;
	onOpenConversation: (id: string) => void;
}) {
	return (
		<>
			{item.source === "meeting" ? (
				<ItemMeetingCard id={item.id} title={item.title} />
			) : item.instruction ? (
				<MessageRun as="div" self>
					<div className="flex justify-end">
						<MessageBubble as="div" self>
							<MessageContent body={item.instruction} />
						</MessageBubble>
					</div>
				</MessageRun>
			) : null}
			{item.outwardRequest ? (
				<OutwardRequestCard
					card={item.outwardRequest}
					conversationId={item.conversationId}
					openLinked={
						item.outwardRequest.owner
							? () => onOpenConversation(item.outwardRequest?.owner?.visitConversationId ?? item.conversationId)
							: undefined
					}
				/>
			) : null}
			{item.failureReason ? <ItemFailureNotice reason={item.failureReason} /> : null}
			{item.source !== "meeting" && item.result ? (
				<MessageRun as="div" self={false}>
					<div className="flex justify-start">
						<MessageBubble as="div" self={false}>
							<MessageContent body={item.result} />
						</MessageBubble>
					</div>
				</MessageRun>
			) : null}
		</>
	);
}

function ItemFailureNotice({ reason }: { reason: string }) {
	const { i18n } = useTranslation();
	const failure = itemFailure(reason, i18n.resolvedLanguage ?? i18n.language);
	return (
		<SystemNotice as="div" tone={failure.tone} role="note">
			{failure.text}
		</SystemNotice>
	);
}
