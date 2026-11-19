import type { Conversation, UsageRun } from "@yonder/protocol";
import { Button, ListGroup } from "@yonder/ui-components";
import type { UsageRunFilter } from "@yonder/ui-data";
import { useConversations, usePerson, useUsageRunCalls, useUsageRuns } from "@yonder/ui-data";
import type { TFunction } from "i18next";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { POOL_COLOR } from "./quota-meters.tsx";
import { formatQuota, formatTokens, QuotaNumber } from "./quota-number.tsx";

/** A conversation as its list row names it: its title, else the other members by name. */
export function conversationName(conversation: Conversation | undefined, personId: string | undefined): string | null {
	if (!conversation) return null;
	if (conversation.title) return conversation.title;
	const others = conversation.members.filter((member) => member.memberId !== personId);
	return others.map((member) => member.displayName).join("、") || null;
}

/** A run's name: its task, plan or meeting title, else the chat it happened in, else what it was for. */
function runName(run: UsageRun, conversations: Conversation[] | undefined, personId: string | undefined, t: TFunction) {
	const chat = conversationName(
		conversations?.find((item) => item.id === run.conversationId),
		personId,
	);
	return run.title || chat || t(`me.quota.purposes.${run.purpose}`);
}

/**
 * Usage one unit of work at a time, the way the user remembers it: one reply, one task step, one
 * meeting note. Fallbacks and tool loops are several model calls but one row; opening the row
 * loads the calls behind it with their tokens.
 */
export function QuotaRunList({ filter, title, empty }: { filter: UsageRunFilter; title?: string; empty?: string }) {
	const { t } = useTranslation();
	const runs = useUsageRuns(filter);
	const conversations = useConversations();
	const person = usePerson();
	const [open, setOpen] = useState<string | null>(null);
	const items = runs.data?.pages.flatMap((page) => page.items) ?? [];
	return (
		<>
			<ListGroup title={title}>
				{items.map((run) => (
					<RunRow
						key={run.id}
						run={run}
						name={runName(run, conversations.data?.items, person?.id, t)}
						expanded={open === run.id}
						onToggle={() => setOpen(open === run.id ? null : run.id)}
					/>
				))}
				{runs.isLoading ? <li className="p-[var(--spacing-4)] text-caption">{t("app.loading")}</li> : null}
				{runs.isError ? (
					<li className="px-[var(--spacing-1)]">
						<Button variant="link" onClick={() => void runs.refetch()}>
							{t("app.retry")}
						</Button>
					</li>
				) : null}
				{!runs.isLoading && !runs.isError && items.length === 0 ? (
					<li className="px-[var(--spacing-1)] py-[var(--spacing-4)] text-caption text-[var(--color-text-tertiary)]">
						{empty ?? t("me.quota.runsEmpty")}
					</li>
				) : null}
			</ListGroup>
			{runs.hasNextPage ? (
				<Button variant="secondary" onClick={() => void runs.fetchNextPage()} loading={runs.isFetchingNextPage}>
					{t("me.quota.more")}
				</Button>
			) : null}
		</>
	);
}

function RunRow({
	run,
	name,
	expanded,
	onToggle,
}: {
	run: UsageRun;
	name: string;
	expanded: boolean;
	onToggle: () => void;
}) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const time = new Intl.DateTimeFormat(locale, {
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(run.at));
	const details = [
		t(`me.quota.pools.${run.pool}`),
		run.overflowRate !== null ? t("me.quota.callOverflow", { rate: run.overflowRate }) : null,
		t("me.quota.callCount", { count: run.calls }),
		run.ok ? null : t("me.quota.callFailed"),
	].filter(Boolean);
	return (
		<li className="border-b border-dashed border-[var(--color-border)] last:border-b-0">
			<button
				type="button"
				aria-expanded={expanded}
				onClick={onToggle}
				className="flex min-h-[var(--row-height)] w-full items-center gap-[var(--spacing-3)] rounded-[var(--radius-sm)] px-[var(--spacing-1)] py-[var(--spacing-2)] text-start hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
			>
				<span
					aria-hidden="true"
					className="h-[var(--spacing-8)] w-[3px] shrink-0 rounded-[var(--radius-full)]"
					style={{ background: POOL_COLOR[run.pool] }}
				/>
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="truncate text-body text-[var(--color-text-primary)]">{name}</span>
					<span className="truncate text-caption text-[var(--color-text-tertiary)]">
						<time dateTime={run.at}>{time}</time> · {details.join(" · ")}
					</span>
				</span>
				<span className="shrink-0 text-body tabular-nums text-[var(--color-text-primary)]">
					{run.usageKnown || run.cost ? formatQuota(-run.cost, locale, true) : t("me.quota.unknownUsage")}
				</span>
				<ChevronDown
					size={16}
					aria-hidden="true"
					className={`shrink-0 text-[var(--color-text-tertiary)] transition-transform ${expanded ? "rotate-180" : ""}`}
				/>
			</button>
			{expanded ? <RunCalls run={run} /> : null}
		</li>
	);
}

/** The calls behind one run, each with the model's display name and its four token counts. */
function RunCalls({ run }: { run: UsageRun }) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const calls = useUsageRunCalls(run.id);
	const tokens = (value: number | null) => (value === null ? t("me.quota.unknownUsage") : formatTokens(value, locale));
	if (calls.isError)
		return (
			<Button variant="link" onClick={() => void calls.refetch()}>
				{t("app.retry")}
			</Button>
		);
	if (!calls.data)
		return (
			<p
				role="status"
				className="px-[var(--spacing-4)] pb-[var(--spacing-3)] text-caption text-[var(--color-text-tertiary)]"
			>
				{t("me.quota.callsLoading")}
			</p>
		);
	return (
		<ul className="mx-[var(--spacing-1)] mb-[var(--spacing-3)] flex flex-col gap-[var(--spacing-2)] rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] p-[var(--spacing-3)]">
			{calls.data.items.map((call) => (
				<li key={call.id} className="flex items-start justify-between gap-[var(--spacing-3)] text-caption">
					<div className="min-w-0 text-[var(--color-text-secondary)]">
						<p className="break-words text-[var(--color-text-primary)]">
							{call.model}
							{call.ok ? "" : ` · ${t("me.quota.callFailed")}`}
						</p>
						<p>{t("me.quota.callTokens", { input: tokens(call.inputTokens), output: tokens(call.outputTokens) })}</p>
						<p>
							{t("me.quota.callCache", { write: tokens(call.cacheWriteTokens), read: tokens(call.cacheReadTokens) })}
						</p>
					</div>
					<span className="shrink-0 text-[var(--color-text-primary)]">
						{call.usageKnown ? <QuotaNumber value={-call.cost} locale={locale} signed /> : t("me.quota.unknownUsage")}
					</span>
				</li>
			))}
		</ul>
	);
}
