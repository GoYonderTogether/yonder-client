import type { Goal, GoalAction } from "@yonder/protocol";
import { Button, ListGroup, TextField } from "@yonder/ui-components";
import { useChangeGoal, useGoalSettings, useGoals } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BotHandoff } from "./bot-handoff.tsx";

function actions(goal: Goal): GoalAction[] {
	if (goal.state === "proposed") return ["confirm", "stop"];
	if (goal.state === "paused") return ["resume", "stop"];
	if (goal.state !== "active") return [];
	return goal.system ? ["stop"] : ["pause", "complete", "stop"];
}

export function GoalRecords() {
	const { t } = useTranslation();
	const goals = useGoals();
	const change = useChangeGoal();
	const settings = useGoalSettings();
	const [editing, setEditing] = useState<string | null>(null);
	return (
		<ListGroup variant="card" title={t("tasks.goalsGoals")}>
			{goals.data?.items.map((goal) => {
				const available = actions(goal);
				return (
					<li
						key={goal.id}
						className="flex flex-col gap-[var(--spacing-2)] border-b border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-3)] last:border-0"
					>
						<div className="flex items-start justify-between gap-[var(--spacing-2)]">
							<span className="text-body text-[var(--color-text-primary)]">{goal.title}</span>
							<span className="shrink-0 text-caption text-[var(--color-text-secondary)]">
								{t(`tasks.goalState.${goal.state}`)}
							</span>
						</div>
						<span className="text-caption text-[var(--color-text-secondary)]">{goal.outcome}</span>
						{goal.progress ? (
							<span className="text-caption">{t("tasks.goalProgress", { text: goal.progress })}</span>
						) : null}
						{goal.nextStep ? (
							<span className="text-caption">{t("tasks.goalNextStep", { text: goal.nextStep })}</span>
						) : null}
						{goal.transfers?.map((transfer) => (
							<span key={transfer.at} className="text-caption text-[var(--color-text-secondary)]">
								{t("tasks.handoffHistory", transfer)} · {new Date(transfer.at).toLocaleString()}
							</span>
						))}
						{!goal.system && (goal.state === "paused" || goal.state === "active") ? (
							<BotHandoff
								key={goal.botId}
								goal
								botId={goal.botId}
								busy={settings.transfer.isPending}
								error={settings.transfer.variables?.id === goal.id ? settings.transfer.error : null}
								onTransfer={(botId) => settings.transfer.mutate({ id: goal.id, botId })}
							/>
						) : null}
						{goal.milestones ? (
							<span className="text-caption text-[var(--color-text-secondary)]">
								{t("tasks.goalMilestones", {
									count: Number(goal.milestones.wrote) + Number(goal.milestones.connected || goal.milestones.planned),
								})}
							</span>
						) : null}
						{editing === goal.id && goal.state === "active" ? (
							<form
								className="flex flex-col gap-[var(--spacing-2)]"
								onSubmit={(event) => {
									event.preventDefault();
									const fields = new FormData(event.currentTarget);
									const progress = String(fields.get("progress") ?? "").trim();
									const nextStep = String(fields.get("nextStep") ?? "").trim();
									if (!progress && !nextStep) return;
									change.mutate(
										{
											id: goal.id,
											action: "progress",
											...(progress ? { progress } : {}),
											...(nextStep ? { nextStep } : {}),
										},
										{ onSuccess: () => setEditing(null) },
									);
								}}
							>
								<TextField
									label={t("tasks.goalProgressField")}
									name="progress"
									maxLength={1000}
									defaultValue={goal.progress ?? ""}
								/>
								<TextField
									label={t("tasks.goalNextStepField")}
									name="nextStep"
									maxLength={500}
									defaultValue={goal.nextStep ?? ""}
								/>
								<div className="flex gap-[var(--spacing-2)]">
									<Button type="submit" size="sm" disabled={change.isPending}>
										{t("app.save")}
									</Button>
									<Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
										{t("app.cancel")}
									</Button>
								</div>
							</form>
						) : available.length ? (
							<div className="flex flex-wrap gap-[var(--spacing-2)]">
								{goal.state === "active" && !goal.system ? (
									<Button variant="secondary" size="sm" disabled={change.isPending} onClick={() => setEditing(goal.id)}>
										{t("tasks.goalAction.progress")}
									</Button>
								) : null}
								{available.map((action) => (
									<Button
										key={action}
										variant={action === "confirm" ? "primary" : "secondary"}
										size="sm"
										disabled={change.isPending}
										onClick={() => change.mutate({ id: goal.id, action })}
									>
										{t(`tasks.goalAction.${action}`)}
									</Button>
								))}
							</div>
						) : null}
					</li>
				);
			})}
			{goals.data?.onboarding ? (
				<li className="p-[var(--spacing-4)] text-caption">
					{goals.data.onboarding.disabled ? (
						t("tasks.onboardingDisabled")
					) : (
						<Button
							variant="secondary"
							size="sm"
							disabled={settings.disable.isPending}
							onClick={() => settings.disable.mutate()}
						>
							{t("tasks.disableOnboarding")}
						</Button>
					)}
					{settings.disable.isError ? <span role="alert">{t("tasks.actionFailed")}</span> : null}
				</li>
			) : null}
			{goals.isLoading || (goals.data?.items.length === 0 && !goals.isError) ? (
				<li className="p-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)]">
					{t(goals.isLoading ? "app.loading" : "tasks.goalsEmptyGoals")}
				</li>
			) : null}
			{goals.isError ? (
				<li className="p-[var(--spacing-4)] text-caption">
					<span role="alert">{t("app.loadFailed")}</span>{" "}
					<Button variant="link" size="sm" onClick={() => void goals.refetch()}>
						{t("app.retry")}
					</Button>
				</li>
			) : null}
			{change.isError ? (
				<li role="alert" className="p-[var(--spacing-4)] text-caption text-[var(--color-danger)]">
					{t("tasks.actionFailed")}
				</li>
			) : null}
		</ListGroup>
	);
}
