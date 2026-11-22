import type { GoalAction } from "@yonder/protocol";
import { Button, IconButton, ListGroup, ListValue, Menu } from "@yonder/ui-components";
import { ApiError, useChangeGoal, useGoalSettings, useGoals, useSchedules } from "@yonder/ui-data";
import { ConfirmDialog } from "@yonder/ui-shell";
import { Ellipsis } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BotHandoff } from "./bot-handoff.tsx";
import { describePlan, formatInstant, resultWord } from "./schedule-format.ts";

/**
 * One goal, opened from the goals tab: what it is for, where it stands, and the recurring check that
 * works on it. Changing it in words is done in chat with the Bot; this panel only confirms, pauses,
 * finishes or stops it.
 */
export function GoalPanel({ goalId }: { goalId: string }) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const goals = useGoals();
	const schedules = useSchedules();
	const change = useChangeGoal();
	const settings = useGoalSettings();
	const [stopping, setStopping] = useState(false);
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
	const live = goal.state === "active" || goal.state === "paused";
	const failure = change.error
		? change.error instanceof ApiError
			? t(change.error.messageKey)
			: t("tasks.actionFailed")
		: null;
	const items = [
		goal.state === "paused"
			? { id: "resume", label: t("tasks.goalAction.resume") }
			: { id: "pause", label: t("tasks.goalAction.pause") },
		{ id: "complete", label: t("tasks.goalAction.complete") },
		{ id: "stop", label: t("tasks.goalAction.stop"), tone: "danger" as const },
	];
	return (
		<div className="flex flex-col gap-[var(--spacing-4)] p-[var(--spacing-4)]">
			<div className="flex items-start justify-between gap-[var(--spacing-3)]">
				<p className="min-w-0 text-body text-[var(--color-text-primary)]">{goal.outcome}</p>
				{live ? (
					<Menu
						label={t("app.more")}
						align="end"
						items={items}
						onSelect={(id) => (id === "stop" ? setStopping(true) : act(id as GoalAction))}
						trigger={(props) => (
							<IconButton {...props} size="sm" aria-label={t("app.more")} disabled={change.isPending}>
								<Ellipsis size={18} aria-hidden="true" />
							</IconButton>
						)}
					/>
				) : null}
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
			{live ? (
				<BotHandoff
					key={goal.botId}
					goal
					botId={goal.botId}
					busy={settings.transfer.isPending}
					error={settings.transfer.variables?.id === goal.id ? settings.transfer.error : null}
					onTransfer={(botId) => settings.transfer.mutate({ id: goal.id, botId })}
				/>
			) : null}
			{failure ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{failure}
				</p>
			) : null}
			{goal.state === "proposed" ? (
				<div className="flex gap-[var(--spacing-2)]">
					<Button variant="primary" disabled={change.isPending} onClick={() => act("confirm")}>
						{t("tasks.goalAction.confirm")}
					</Button>
					<Button variant="secondary" disabled={change.isPending} onClick={() => act("stop")}>
						{t("tasks.declineGoal")}
					</Button>
				</div>
			) : null}
			<ConfirmDialog
				open={stopping}
				title={t("tasks.goalAction.stop")}
				body={goal.title}
				confirmLabel={t("tasks.goalAction.stop")}
				cancelLabel={t("app.cancel")}
				closeLabel={t("app.close")}
				backLabel={t("app.back")}
				busy={change.isPending}
				onCancel={() => setStopping(false)}
				onConfirm={() => {
					act("stop");
					setStopping(false);
				}}
			/>
		</div>
	);
}
