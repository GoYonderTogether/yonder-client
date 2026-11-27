import type { GoalAction } from "@yonder/protocol";
import { Button, IconButton, ListGroup, ListValue, Menu } from "@yonder/ui-components";
import { ApiError, useChangeGoal, useGoals, useRemoveGoal, useSchedules } from "@yonder/ui-data";
import { ConfirmDialog, useSidePanel } from "@yonder/ui-shell";
import { Ellipsis } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAskMainBot } from "../app/ask-main-bot.tsx";
import { describePlan, formatInstant, resultWord } from "./schedule-format.ts";

/**
 * One goal, opened from the goals tab: what it is for, where it stands, and the recurring check that
 * works on it. Meta Muse is the reference (2026-11-24): finishing a goal is one tap, changing it is
 * telling the main Bot (「编辑」 fills the draft), and deleting it asks once. Pause, resume, stop and
 * hand-off are the Bot's own tools, not app controls; a goal the Bot proposed keeps 确认 / 不用.
 */
export function GoalPanel({ goalId }: { goalId: string }) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const side = useSidePanel();
	const ask = useAskMainBot();
	const goals = useGoals();
	const schedules = useSchedules();
	const change = useChangeGoal();
	const remove = useRemoveGoal();
	const [deleting, setDeleting] = useState(false);
	const goal = goals.data?.items.find((item) => item.id === goalId);
	if (!goal)
		return (
			<p className="p-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)]">
				{goals.isError ? t("app.loadFailed") : t("app.loading")}
			</p>
		);
	// Ending a goal ends its plans on the server, so the schedule list is read again afterwards.
	const act = (action: GoalAction) =>
		change.mutate({ id: goal.id, action }, { onSuccess: () => void schedules.refetch() });
	const check = schedules.data?.items.find((plan) => plan.goalId === goal.id && plan.kind !== "once");
	const active = goal.state === "active";
	const proposed = goal.state === "proposed";
	const refused = change.error ?? remove.error;
	const failure = refused ? (refused instanceof ApiError ? t(refused.messageKey) : t("tasks.actionFailed")) : null;
	const busy = change.isPending || remove.isPending;
	const items = [
		...(active ? [{ id: "complete", label: t("tasks.goalAction.complete") }] : []),
		{ id: "edit", label: t("app.edit") },
		{ id: "delete", label: t("tasks.delete"), tone: "danger" as const },
	];
	return (
		<div className="flex flex-col gap-[var(--spacing-4)] p-[var(--spacing-4)]">
			<div className="flex items-start justify-between gap-[var(--spacing-3)]">
				<p className="min-w-0 text-body text-[var(--color-text-primary)]">{goal.outcome}</p>
				{proposed ? null : (
					<Menu
						label={t("app.more")}
						align="end"
						items={items}
						onSelect={(id) => {
							if (id === "delete") return setDeleting(true);
							if (id === "edit") return ask(t("tasks.presetGoalEdit", { title: goal.title }));
							if (id === "complete") act("complete");
						}}
						trigger={(props) => (
							<IconButton {...props} size="sm" aria-label={t("app.more")} disabled={busy}>
								<Ellipsis size={18} aria-hidden="true" />
							</IconButton>
						)}
					/>
				)}
			</div>
			{goal.progress || goal.nextStep ? (
				<section className="flex flex-col gap-[var(--spacing-1)]">
					<h2 className="text-caption text-[var(--color-text-tertiary)]">{t("tasks.progressTitle")}</h2>
					{goal.progress ? <p className="text-body">{goal.progress}</p> : null}
					{goal.nextStep ? <p className="text-body">{goal.nextStep}</p> : null}
				</section>
			) : null}
			{check ? (
				<section className="flex flex-col gap-[var(--spacing-2)]">
					<p className="text-caption text-[var(--color-text-secondary)]">
						{describePlan(check, t)}
						{check.nextRunAt
							? ` · ${t("tasks.nextCheck", { at: formatInstant(check.timezone, check.nextRunAt, locale) })}`
							: ""}
					</p>
					{check.recentRuns.length ? (
						<ListGroup title={t("tasks.runsTitle")}>
							{check.recentRuns.slice(0, 5).map((run) => (
								<ListValue
									key={run.id}
									title={formatInstant(check.timezone, run.scheduledFor, locale)}
									value={run.result ? resultWord(run.result, t) : ""}
								/>
							))}
						</ListGroup>
					) : null}
				</section>
			) : null}
			{goal.transfers?.map((transfer) => (
				<p key={transfer.at} className="text-caption text-[var(--color-text-secondary)]">
					{t("tasks.handoffHistory", transfer)} · {new Date(transfer.at).toLocaleString(locale)}
				</p>
			))}
			{failure ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{failure}
				</p>
			) : null}
			{goal.state === "proposed" ? (
				<div className="flex gap-[var(--spacing-2)]">
					<Button variant="primary" disabled={busy} onClick={() => act("confirm")}>
						{t("tasks.goalAction.confirm")}
					</Button>
					<Button variant="secondary" disabled={busy} onClick={() => act("stop")}>
						{t("tasks.declineGoal")}
					</Button>
				</div>
			) : null}
			<ConfirmDialog
				open={deleting}
				title={t("tasks.deleteTitle", { title: goal.title })}
				body={t("tasks.deleteIrreversible")}
				confirmLabel={t("tasks.delete")}
				cancelLabel={t("app.cancel")}
				closeLabel={t("app.close")}
				busy={remove.isPending}
				onCancel={() => setDeleting(false)}
				onConfirm={() => {
					remove.mutate(goal.id, { onSuccess: () => void side.close() });
					setDeleting(false);
				}}
			/>
		</div>
	);
}
