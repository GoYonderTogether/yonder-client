import { MessageBubble, MessageRun, SystemNotice } from "@yonder/chat-presentation";
import type { ItemDetail } from "@yonder/protocol";
import { Button, EmptyState, TaskGlyph } from "@yonder/ui-components";
import { ApiError, useItem, useItemActions, type useItemSession } from "@yonder/ui-data";
import { PageFrame, useShellChrome } from "@yonder/ui-shell";
import { CircleCheck, CircleX, Clock3, Ellipsis } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ItemMeetingCard } from "./item-meeting-card.tsx";
import { ItemSessionTitle } from "./item-session-title.tsx";
import { itemActions, itemFailure, itemGroup, itemTimeLabel, itemTrailingKey, localDay } from "./items-format.ts";
import { MessageContent } from "./message-content.tsx";
import { ConversationPage } from "./messages-page.tsx";
import { OutwardRequestCard } from "./outward-request-card.tsx";
import { TaskOutputFiles } from "./task-detail.tsx";

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
	const { mode } = useShellChrome();
	const query = useItem(itemId);
	const actions = useItemActions();
	const item = query.data;
	const locale = i18n.resolvedLanguage ?? i18n.language;
	if (!item)
		return (
			<PageFrame title={t("tasks.itemHeading")}>
				{query.isError ? (
					<EmptyState
						icon={<TaskGlyph size={24} />}
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
	const mobile = mode === "mobile";
	const timing = <ItemTiming item={item} locale={locale} t={t} />;
	const title = (
		<div className="flex min-w-0 flex-col gap-[calc(var(--spacing-1)/2)]">
			<ItemSessionTitle key={item.id} id={item.id} title={item.title} canRename={canRename && !disconnected} />
			{mobile ? timing : null}
		</div>
	);
	const allowed = itemActions(item);
	const busy = actions.cancel.isPending;
	/**
	 * Meta Muse is the reference (2026-11-24): a running item can be stopped; pausing, resuming and
	 * handing off are the Bot's own tools, told in chat.
	 */
	const cancel = allowed.cancel ? (
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
	const action = (
		<>
			{mobile ? null : <div className="min-w-0 max-w-[30vi]">{timing}</div>}
			{cancel}
		</>
	);
	const actionError = actions.cancel.isError ? "tasks.itemCancelFailed" : null;
	const reason = actions.cancel.error;
	const hasSeed =
		Boolean(item.files?.length) ||
		(item.source !== "conversation" &&
			(item.source === "meeting" || item.instruction || item.outwardRequest || item.failureReason || item.result));
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
						icon={<TaskGlyph size={24} />}
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

function ItemTiming({
	item,
	locale,
	t,
}: {
	item: ItemDetail;
	locale: string;
	t: ReturnType<typeof useTranslation>["t"];
}) {
	const Status =
		item.state === "completed" ? CircleCheck : item.state === "failed" || item.state === "cancelled" ? CircleX : Clock3;
	const dates = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" });
	const start = new Date(item.startedAt);
	const end = item.endedAt ? new Date(item.endedAt) : null;
	const group = itemGroup(item.startedAt, new Date());
	const day =
		group === "earlier" ? dates.format(start) : t(group === "today" ? "tasks.itemsToday" : "tasks.itemsYesterday");
	const started = itemTimeLabel(item.startedAt, locale);
	const ended = item.endedAt ? itemTimeLabel(item.endedAt, locale) : null;
	const endDay = end && localDay(end) !== localDay(start) ? dates.format(end) : null;
	const word = itemTrailingKey(item);
	return (
		<div className="flex min-w-0 items-center gap-[var(--spacing-1)] text-caption font-normal text-[var(--color-text-secondary)]">
			<Status size={14} aria-hidden="true" className="shrink-0" />
			{word ? (
				<>
					<span className="shrink-0">{t(word)}</span>
					<span aria-hidden="true">·</span>
				</>
			) : null}
			<span className="truncate">
				<time dateTime={item.startedAt} title={t("tasks.itemStartedAt", { at: `${dates.format(start)} ${started}` })}>
					{day} {started}
				</time>
				{item.endedAt && end && ended ? (
					<>
						<span aria-hidden="true"> – </span>
						<time dateTime={item.endedAt} title={t("tasks.itemEndedAt", { at: `${dates.format(end)} ${ended}` })}>
							{endDay ? `${endDay} ` : ""}
							{ended}
						</time>
					</>
				) : null}
			</span>
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
			) : item.source !== "conversation" && item.instruction ? (
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
			{item.source !== "conversation" && item.failureReason ? <ItemFailureNotice reason={item.failureReason} /> : null}
			{item.source !== "meeting" && item.source !== "conversation" && item.result ? (
				<MessageRun as="div" self={false}>
					<div className="flex justify-start">
						<MessageBubble as="div" self={false}>
							<MessageContent body={item.result} />
						</MessageBubble>
					</div>
				</MessageRun>
			) : null}
			{item.files?.length ? <TaskOutputFiles paths={item.files} /> : null}
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
