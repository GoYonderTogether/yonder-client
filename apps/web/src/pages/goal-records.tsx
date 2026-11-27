import type { Goal, Schedule } from "@yonder/protocol";
import { Button, EmptyState, ListGroup, ListRow } from "@yonder/ui-components";
import { ApiError, useGoals, useSchedules } from "@yonder/ui-data";
import { useSidePanel } from "@yonder/ui-shell";
import { ICON_SIZE } from "@yonder/ui-tokens";
import { CalendarClock, Target } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GoalPanel } from "./goal-panel.tsx";
import { useMinute } from "./memory/memory-format.ts";
import { relativeTime } from "./memory/memory-who.ts";
import { describePlan, formatInstant, planStatusKey, resultWord } from "./schedule-format.ts";
import { SchedulePanel } from "./schedule-panel.tsx";

/** A goal the Bot keeps working on, with its recurring check when it has one. */
const LIVE = new Set<Goal["state"]>(["proposed", "active", "paused"]);

/**
 * 「目标」 (11-循环设计-v3 第 5.1 节): what the Bot keeps working on for the owner. Goals still in play,
 * then recurring plans that belong to no goal, then finished goals folded away. A row says where the
 * thing stands in one line; everything else opens in the side panel.
 *
 * Meta Muse is the reference (2026-11-24): the only words a row adds are 「待确认」 for a goal the
 * Bot proposed and 「已暂停」 for one it stopped; the owner has no control either way.
 */
export function GoalsTab() {
	const { t } = useTranslation();
	const goalsQuery = useGoals();
	const schedulesQuery = useSchedules();
	const side = useSidePanel();
	const [doneOpen, setDoneOpen] = useState(false);
	if (goalsQuery.isLoading && !goalsQuery.data)
		return (
			<ListGroup>
				<li className="p-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)]">{t("app.loading")}</li>
			</ListGroup>
		);
	const failed = (goalsQuery.isError && !goalsQuery.data) || (schedulesQuery.isError && !schedulesQuery.data);
	const failure = goalsQuery.error ?? schedulesQuery.error;
	const goals = (goalsQuery.data?.items ?? []).filter((goal) => !goal.system);
	const schedules = schedulesQuery.data?.items ?? [];
	const live = goals
		.filter((goal) => LIVE.has(goal.state))
		.sort((left, right) => Number(right.state === "proposed") - Number(left.state === "proposed"));
	const done = goals.filter((goal) => !LIVE.has(goal.state));
	const plans = schedules.filter((plan) => plan.kind !== "once" && !plan.goalId);
	const openGoal = (goal: Goal) =>
		side.open({
			key: `goal:${goal.id}`,
			title: goal.title,
			icon: <Target size={ICON_SIZE.sm} aria-hidden="true" />,
			content: <GoalPanel goalId={goal.id} />,
		});
	const openPlan = (plan: Schedule) =>
		side.open({
			key: `schedule:${plan.id}`,
			title: plan.title,
			icon: <CalendarClock size={ICON_SIZE.sm} aria-hidden="true" />,
			content: <SchedulePanel scheduleId={plan.id} />,
		});
	return (
		<div className="flex flex-col gap-[var(--spacing-4)] py-[var(--spacing-3)]">
			{failed ? (
				<p
					role="alert"
					className="flex items-center gap-[var(--spacing-2)] px-[var(--spacing-2)] text-caption text-[var(--color-danger)]"
				>
					{failure instanceof ApiError ? t(failure.messageKey) : t("app.loadFailed")}
					<Button
						variant="link"
						size="sm"
						onClick={() => void Promise.all([goalsQuery.refetch(), schedulesQuery.refetch()])}
					>
						{t("app.retry")}
					</Button>
				</p>
			) : null}
			{live.length ? (
				<ListGroup title={t("tasks.groupActive")}>
					{live.map((goal) => (
						<GoalRow key={goal.id} goal={goal} schedules={schedules} trailing onOpen={() => openGoal(goal)} />
					))}
				</ListGroup>
			) : null}
			{plans.length ? (
				<ListGroup title={t("tasks.groupSchedules")}>
					{plans.map((plan) => (
						<PlanRow key={plan.id} plan={plan} onOpen={() => openPlan(plan)} />
					))}
				</ListGroup>
			) : null}
			{done.length ? (
				<ListGroup>
					<ListRow
						title={t("tasks.groupDone", { count: done.length })}
						aria-expanded={doneOpen}
						onClick={() => setDoneOpen((open) => !open)}
					/>
					{doneOpen
						? done.map((goal) => (
								<GoalRow key={goal.id} goal={goal} schedules={schedules} onOpen={() => openGoal(goal)} />
							))
						: null}
				</ListGroup>
			) : null}
			{!live.length && !plans.length && !failed ? (
				<ListGroup>
					<EmptyState as="li" icon={<Target size={24} strokeWidth={1.6} />} title={t("tasks.goalsEmptyGoals")} />
				</ListGroup>
			) : null}
		</div>
	);
}

function GoalRow({
	goal,
	schedules,
	trailing = false,
	onOpen,
}: {
	goal: Goal;
	schedules: readonly Schedule[];
	trailing?: boolean;
	onOpen: () => void;
}) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const now = useMinute();
	const ago = (iso: string) => relativeTime(iso, now, locale, t("memory.justNow"));
	const check = schedules.find((plan) => plan.goalId === goal.id && plan.kind !== "once");
	let subtitle: string;
	if (check) {
		const parts = [
			check.nextRunAt ? t("tasks.nextCheck", { at: formatInstant(check.timezone, check.nextRunAt, locale) }) : null,
			check.lastRunAt && check.lastResult
				? t("tasks.lastCheck", { result: resultWord(check.lastResult, t), when: ago(check.lastRunAt) })
				: null,
		].filter(Boolean);
		subtitle = parts.length ? parts.join(" · ") : goal.outcome;
	} else if (goal.progress) {
		subtitle = `${goal.progress.split("\n")[0]?.trim() ?? ""} · ${ago(goal.changedAt)}`;
	} else {
		subtitle = goal.outcome;
	}
	const state = trailing && (goal.state === "proposed" || goal.state === "paused") ? goal.state : null;
	return (
		<ListRow
			title={goal.title}
			subtitle={subtitle}
			trailing={state ? t(`tasks.goalState.${state}`) : undefined}
			chevron
			onClick={onOpen}
		/>
	);
}

function PlanRow({ plan, onOpen }: { plan: Schedule; onOpen: () => void }) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const next = plan.nextRunAt
		? ` · ${t("tasks.nextRun", { at: formatInstant(plan.timezone, plan.nextRunAt, locale) })}`
		: "";
	const status = planStatusKey(plan.status);
	return (
		<ListRow
			title={plan.title}
			subtitle={`${describePlan(plan, t)}${next}`}
			trailing={status ? t(status) : undefined}
			chevron
			onClick={onOpen}
		/>
	);
}
