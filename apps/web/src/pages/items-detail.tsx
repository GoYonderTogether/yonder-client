import { MessageBubble, MessageRun } from "@yonder/chat-presentation";
import type { ItemDetail } from "@yonder/protocol";
import { Button, EmptyState } from "@yonder/ui-components";
import { ApiError, useItem, useItemActions, type useItemSession } from "@yonder/ui-data";
import { PageFrame } from "@yonder/ui-shell";
import { CircleCheck, CircleX, Clock3, Ellipsis, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BotHandoff } from "./bot-handoff.tsx";
import { ItemMeetingCard } from "./item-meeting-card.tsx";
import { ItemSessionTitle } from "./item-session-title.tsx";
import { itemActions, itemFailureKey, itemGroup, itemStateKey, itemTimeLabel, localDay } from "./items-format.ts";
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
	const title = <ItemHeader item={item} locale={locale} t={t} canRename={canRename && !disconnected} />;
	const allowed = itemActions(item);
	const busy =
		actions.cancel.isPending || actions.pause.isPending || actions.resume.isPending || actions.transfer.isPending;
	const action = allowed.cancel ? (
		<details className="relative z-10">
			<summary
				aria-label={t("tasks.itemActions")}
				className="flex size-[var(--control-md)] cursor-pointer list-none items-center justify-center rounded-[var(--radius-full)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] [&::-webkit-details-marker]:hidden"
			>
				<Ellipsis size={20} aria-hidden="true" />
			</summary>
			<div className="absolute end-0 top-full flex min-w-max flex-col gap-[var(--spacing-2)] rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-raised)] p-[var(--spacing-3)] shadow-[var(--shadow-lg)]">
				{allowed.pause ? (
					<Button variant="secondary" size="sm" disabled={busy} onClick={() => actions.pause.mutate(item.id)}>
						{t("tasks.pause")}
					</Button>
				) : null}
				{allowed.resume ? (
					<Button variant="secondary" size="sm" disabled={busy} onClick={() => actions.resume.mutate(item.id)}>
						{t("tasks.resume")}
					</Button>
				) : null}
				<Button variant="danger" size="sm" disabled={busy} onClick={() => actions.cancel.mutate(item.id)}>
					{t("tasks.itemCancel")}
				</Button>
				{item.state === "paused" ? (
					<BotHandoff
						key={item.botMemberId}
						botId={item.botMemberId}
						busy={busy}
						error={actions.transfer.error}
						onTransfer={(botId) => actions.transfer.mutate({ id: item.id, botId })}
					/>
				) : null}
			</div>
		</details>
	) : null;
	const actionError = actions.cancel.isError
		? "tasks.itemCancelFailed"
		: actions.pause.isError
			? "tasks.itemPauseFailed"
			: actions.resume.isError
				? "tasks.itemResumeFailed"
				: null;
	const reason = actions.cancel.error ?? actions.pause.error ?? actions.resume.error;
	const hasSeed =
		item.source !== "conversation" &&
		(item.source === "meeting" || item.instruction || item.outwardRequest || item.failureReason || item.result);
	const intro =
		hasSeed || actionError ? (
			<>
				{actionError ? (
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{t(actionError)}
						{reason instanceof ApiError ? ` ${t(reason.messageKey)}` : null}
					</p>
				) : null}
				{hasSeed ? <ItemIntroduction item={item} onOpenConversation={onOpenConversation} /> : null}
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
	t,
	canRename,
}: {
	item: ItemDetail;
	locale: string;
	t: ReturnType<typeof useTranslation>["t"];
	canRename: boolean;
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
	return (
		<div className="flex min-w-0 flex-col gap-[calc(var(--spacing-1)/2)]">
			<ItemSessionTitle key={item.id} id={item.id} title={item.title} canRename={canRename} />
			<div className="flex min-w-0 items-center gap-[var(--spacing-1)] text-caption font-normal text-[var(--color-text-secondary)]">
				<Status size={14} aria-hidden="true" className="shrink-0" />
				<span className="shrink-0">{t(itemStateKey(item.state))}</span>
				<span aria-hidden="true">·</span>
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
	const { t } = useTranslation();
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
			{item.failureReason ? (
				<p role="note" className="text-center text-caption text-[var(--color-danger)]">
					{t(itemFailureKey(item.failureReason), { title: item.title })}
				</p>
			) : null}
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
