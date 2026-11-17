import { Button, EmptyState, ListGroup } from "@yonder/ui-components";
import { ApiError, useContacts, useItem, useItemActions } from "@yonder/ui-data";
import { ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { itemActions, itemFailureKey, itemSourceKey, itemStateKey } from "./items-format.ts";

/**
 * One item (16-3 第五节、第八节): what it is, what it produced or why it stopped, the steps the source
 * recorded, and — for a subtask that is still going — pause, resume and cancel. A blocked item shows
 * one reason and one action; the other sources are records and offer none.
 */
export function ItemDetailPage({
	itemId,
	onOpenConversation,
}: {
	itemId: string | null;
	onOpenConversation: (id: string) => void;
}) {
	const { t, i18n } = useTranslation();
	const query = useItem(itemId);
	const actions = useItemActions();
	const contacts = useContacts();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const failure = actions.cancel.error ?? actions.pause.error ?? actions.resume.error;
	const failedKey = actions.cancel.isError
		? "tasks.itemCancelFailed"
		: actions.pause.isError
			? "tasks.itemPauseFailed"
			: actions.resume.isError
				? "tasks.itemResumeFailed"
				: null;

	if (!itemId) return null;
	if (query.isError)
		return (
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
		);
	const item = query.data;
	if (!item) return null;
	const allowed = itemActions(item);
	const bot = contacts.data?.items.find((member) => member.id === item.botMemberId);
	const busy = actions.cancel.isPending || actions.pause.isPending || actions.resume.isPending;
	return (
		<article className="flex flex-col gap-[var(--spacing-4)] py-[var(--spacing-4)]">
			<header className="flex flex-col gap-[var(--spacing-1)]">
				<h1 className="text-h3 font-semibold text-[var(--color-text-primary)]">{item.title}</h1>
				<p className="text-caption text-[var(--color-text-secondary)]">
					{t(itemStateKey(item.state))} · {t(itemSourceKey(item.source))}
					{bot ? ` · ${t("tasks.itemDetailBot", { name: bot.displayName })}` : null}
				</p>
				<p className="text-caption text-[var(--color-text-tertiary)]">
					{t("tasks.itemStartedAt", { at: when(item.startedAt, locale) })}
					{item.endedAt ? ` · ${t("tasks.itemEndedAt", { at: when(item.endedAt, locale) })}` : null}
				</p>
			</header>
			{failedKey ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{failure instanceof ApiError
						? t(failedKey, { reason: t(failure.messageKey) })
						: t(failedKey, { reason: t("chat.runFailed") })}
				</p>
			) : null}
			{item.instruction ? (
				<ListGroup title={t("tasks.itemDetailInstruction")}>
					<li className="whitespace-pre-wrap p-[var(--spacing-4)] text-body text-[var(--color-text-primary)]">
						{item.instruction}
					</li>
				</ListGroup>
			) : null}
			<ListGroup title={item.failureReason ? t("tasks.itemDetailFailure") : t("tasks.itemDetailResult")}>
				<li className="whitespace-pre-wrap p-[var(--spacing-4)] text-body text-[var(--color-text-primary)]">
					{item.failureReason
						? t(itemFailureKey(item.failureReason), { title: item.title })
						: (item.result ?? t("tasks.itemNoResult"))}
				</li>
			</ListGroup>
			{item.steps.length ? (
				<ListGroup title={t("tasks.itemDetailSteps")}>
					{item.steps.map((step) => (
						<li
							key={`${step.kind}-${step.at}`}
							className="flex flex-col gap-[var(--spacing-1)] border-b border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-3)] last:border-0"
						>
							<span className="text-caption text-[var(--color-text-primary)]">{step.kind}</span>
							<span className="text-caption text-[var(--color-text-tertiary)]">{when(step.at, locale)}</span>
						</li>
					))}
				</ListGroup>
			) : null}
			<div className="flex flex-wrap gap-[var(--spacing-2)]">
				<Button variant="secondary" onClick={() => onOpenConversation(item.conversationId)}>
					{t("tasks.itemOpenConversation")}
				</Button>
				{allowed.pause ? (
					<Button variant="secondary" disabled={busy} onClick={() => actions.pause.mutate(item.id)}>
						{t("tasks.pause")}
					</Button>
				) : null}
				{allowed.resume ? (
					<Button variant="secondary" disabled={busy} onClick={() => actions.resume.mutate(item.id)}>
						{t("tasks.resume")}
					</Button>
				) : null}
				{allowed.cancel ? (
					<Button variant="danger" disabled={busy} onClick={() => actions.cancel.mutate(item.id)}>
						{t("tasks.itemCancel")}
					</Button>
				) : null}
			</div>
		</article>
	);
}

/** An instant in the reader's own format; the record keeps ISO, the page shows local time. */
function when(iso: string, locale: string): string {
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) return iso;
	return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(at);
}
