import type { Schedule, ScheduleStatus } from "@yonder/protocol";
import { Button, EmptyState, ListGroup, Segmented } from "@yonder/ui-components";
import { ApiError, useScheduleActions, useSchedules } from "@yonder/ui-data";
import { ListFrame, PageFrame } from "@yonder/ui-shell";
import { CalendarClock, ListChecks } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GoalRecords } from "./goal-records.tsx";
import { ItemDetailPage } from "./items-detail.tsx";
import { upcomingOneOffs } from "./items-format.ts";
import { ItemsList } from "./items-list.tsx";
import { ScheduleForm } from "./schedule-form.tsx";
import { describePlan, formatInstant, type Translate } from "./schedule-format.ts";
import { TaskActions } from "./task-actions.tsx";

/**
 * 「事项 | 目标」 (16-3 第九节): the items tab is every finished or running piece of work, the goals
 * tab is what the Bot keeps watching. Creation lives in the title row; the goals menu preserves
 * both a goal and a scheduled-task action.
 */
export function TasksList({
	scheduled,
	onChange,
	onOpenItem,
	onAdd,
	onSchedule,
}: {
	scheduled: boolean;
	onChange: (scheduled: boolean) => void;
	onOpenItem: (id: string) => void;
	onAdd: () => void;
	onSchedule?: (() => void) | undefined;
}) {
	const { t } = useTranslation();
	const [creating, setCreating] = useState(false);
	return (
		<ListFrame
			title={t("nav.tasks")}
			action={
				<TaskActions
					key={String(scheduled)}
					scheduled={scheduled}
					onAdd={onAdd}
					onCreateSchedule={onSchedule ?? (() => setCreating(true))}
				/>
			}
			center={
				<Segmented
					options={[
						{ value: "items", label: t("tasks.title") },
						{ value: "goals", label: t("tasks.goals") },
					]}
					value={scheduled ? "goals" : "items"}
					onChange={(value) => {
						setCreating(false);
						onChange(value === "goals");
					}}
					aria-label={t("nav.tasks")}
				/>
			}
		>
			{scheduled && creating ? (
				<ScheduleForm onCancel={() => setCreating(false)} onDone={() => setCreating(false)} />
			) : null}
			{scheduled ? (
				<div className="flex flex-col gap-[var(--spacing-4)]">
					<GoalRecords />
					<GoalsList creating={creating} />
				</div>
			) : (
				<div className="flex flex-col gap-[var(--spacing-4)]">
					<UpcomingOneOffs />
					<ItemsList onOpen={onOpenItem} />
				</div>
			)}
		</ListFrame>
	);
}

export function TaskPage({
	taskId,
	onOpenConversation,
}: {
	taskId: string | null;
	onOpenConversation: (id: string) => void;
}) {
	const { t } = useTranslation();
	return (
		<PageFrame title={taskId ? t("tasks.itemHeading") : null}>
			{taskId ? (
				<ItemDetailPage itemId={taskId} onOpenConversation={onOpenConversation} />
			) : (
				<div className="flex flex-1 items-center justify-center">
					<EmptyState icon={<ListChecks size={24} strokeWidth={1.6} />} title={t("tasks.emptyTitle")} />
				</div>
			)}
		</PageFrame>
	);
}

/**
 * A one-off plan has not run yet, so it is not an item until it does. It is still the user's next
 * thing, so it is listed above the items rather than hidden in a separate tab (16-3 第二节).
 */
function UpcomingOneOffs() {
	const { t, i18n } = useTranslation();
	const schedules = useSchedules();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const upcoming = upcomingOneOffs(schedules.data?.items ?? []);
	if (!upcoming.length) return null;
	return (
		<ListGroup title={t("tasks.itemUpcoming")}>
			{upcoming.map((plan) => (
				<li
					key={plan.id}
					className="flex flex-col gap-[var(--spacing-1)] border-b border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-3)] last:border-0"
				>
					<span className="truncate text-body text-[var(--color-text-primary)]">{plan.title}</span>
					<span className="text-caption text-[var(--color-text-secondary)]">
						{formatInstant(plan.timezone, plan.nextRunAt ?? plan.at, locale)}
					</span>
				</li>
			))}
		</ListGroup>
	);
}

function GoalsList({ creating }: { creating: boolean }) {
	const { t, i18n } = useTranslation();
	const schedules = useSchedules();
	const actions = useScheduleActions();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const items = schedules.data?.items ?? [];
	// A recurring plan is what the Bot keeps watching; a one-off is an item, listed in the other tab.
	const tracking = items.filter((plan) => plan.kind !== "once");
	const busy = actions.pause.isPending || actions.resume.isPending || actions.remove.isPending;
	// The hooks report success only, so a refused action has to be said here, in its real words.
	const refused = [actions.pause, actions.resume, actions.remove].find((action) => action.isError);
	const failure = refused
		? t(
				refused === actions.pause
					? "tasks.actionPauseFailed"
					: refused === actions.resume
						? "tasks.actionResumeFailed"
						: "tasks.actionDeleteFailed",
				{ reason: refused.error instanceof ApiError ? t(refused.error.messageKey) : t("tasks.actionFailed") },
			)
		: null;
	if (schedules.isLoading)
		return (
			<ListGroup>
				<li className="p-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)]">{t("app.loading")}</li>
			</ListGroup>
		);
	if (schedules.isError && !schedules.data)
		return (
			<ListGroup>
				<li className="flex items-center gap-[var(--spacing-3)] p-[var(--spacing-4)] text-caption text-[var(--color-danger)]">
					<span role="alert">
						{schedules.error instanceof ApiError ? t(schedules.error.messageKey) : t("app.loadFailed")}
					</span>
					<Button variant="link" size="sm" onClick={() => void schedules.refetch()}>
						{t("app.retry")}
					</Button>
				</li>
			</ListGroup>
		);
	return (
		<div className="flex flex-col gap-[var(--spacing-4)] py-[var(--spacing-3)]">
			{failure ? (
				<p role="alert" className="px-[var(--spacing-2)] text-caption text-[var(--color-danger)]">
					{failure}
				</p>
			) : null}
			<ListGroup title={t("tasks.tracking")}>
				{tracking.map((item) => (
					<ScheduleRow
						key={item.id}
						schedule={item}
						locale={locale}
						busy={busy}
						onPause={() => actions.pause.mutate(item.id)}
						onResume={() => actions.resume.mutate(item.id)}
						onDelete={() => actions.remove.mutate(item.id)}
					/>
				))}
				{!tracking.length && !creating ? (
					<li>
						<EmptyState icon={<CalendarClock size={24} strokeWidth={1.6} />} title={t("tasks.goalsEmptyTracking")} />
					</li>
				) : null}
			</ListGroup>
		</div>
	);
}

function ScheduleRow({
	schedule,
	locale,
	busy,
	onPause,
	onResume,
	onDelete,
}: {
	schedule: Schedule;
	locale: string;
	busy: boolean;
	onPause: () => void;
	onResume: () => void;
	onDelete: () => void;
}) {
	const { t } = useTranslation();
	const paused = schedule.status === "paused";
	const finished = schedule.status === "ended" || schedule.status === "missed";
	return (
		<li className="flex flex-col gap-[var(--spacing-2)] border-b border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-3)] last:border-0">
			<div className="flex items-start justify-between gap-[var(--spacing-3)]">
				<div className="flex min-w-0 flex-col gap-[var(--spacing-1)]">
					<span className="truncate text-body text-[var(--color-text-primary)]">{schedule.title}</span>
					<span className="text-caption text-[var(--color-text-secondary)]">
						{describePlan(schedule, t)} · {schedule.timezone}
					</span>
					<span className="text-caption text-[var(--color-text-secondary)]">
						{schedule.nextRunAt
							? t("tasks.nextRun", { at: formatInstant(schedule.timezone, schedule.nextRunAt, locale) })
							: t("tasks.noNextRun")}
					</span>
					<span className="text-caption text-[var(--color-text-tertiary)]">
						{t("tasks.lastResult")}：{lastResultText(schedule, t, locale)}
					</span>
				</div>
				<span className="shrink-0 text-caption text-[var(--color-text-secondary)]">
					{schedule.action === "reminder" ? t("tasks.actionReminder") : t("tasks.actionTask")} ·{" "}
					{t(statusKey(schedule.status))}
					{schedule.createdBy === "bot" ? ` · ${t("tasks.createdByBot")}` : ""}
				</span>
			</div>
			<div className="flex flex-wrap gap-[var(--spacing-2)]">
				{!finished ? (
					<Button size="sm" variant="secondary" disabled={busy} onClick={paused ? onResume : onPause}>
						{paused ? t("tasks.resume") : t("tasks.pause")}
					</Button>
				) : null}
				<Button size="sm" variant="danger" disabled={busy} onClick={onDelete}>
					{t("tasks.delete")}
				</Button>
			</div>
		</li>
	);
}

function lastResultText(schedule: Schedule, t: Translate, locale: string): string {
	if (!schedule.lastRunAt || !schedule.lastResult) return t("tasks.lastRunNever");
	const at = formatInstant(schedule.timezone, schedule.lastRunAt, locale);
	const result =
		schedule.lastResult === "reported"
			? t("tasks.resultReported")
			: schedule.lastResult === "skipped"
				? t("tasks.resultSkipped")
				: schedule.lastResult === "failed"
					? t("tasks.resultFailed")
					: t("tasks.resultMissed");
	return `${result} · ${at}`;
}

function statusKey(status: ScheduleStatus): string {
	return status === "active"
		? "tasks.statusActive"
		: status === "paused"
			? "tasks.statusPaused"
			: status === "ended"
				? "tasks.statusEnded"
				: "tasks.statusMissed";
}
