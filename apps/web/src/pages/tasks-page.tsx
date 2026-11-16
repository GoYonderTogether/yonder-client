import type { Schedule, ScheduleStatus } from "@yonder/protocol";
import { Button, EmptyState, ListGroup, Segmented } from "@yonder/ui-components";
import { ApiError, useScheduleActions, useSchedules } from "@yonder/ui-data";
import { ListFrame, PageFrame } from "@yonder/ui-shell";
import { CalendarClock, ListChecks } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScheduleForm } from "./schedule-form.tsx";
import { describePlan, formatInstant, type Translate } from "./schedule-format.ts";

export function TasksList({ scheduled, onChange }: { scheduled: boolean; onChange: (scheduled: boolean) => void }) {
	const { t } = useTranslation();
	return (
		<ListFrame
			title={t("nav.tasks")}
			center={
				<Segmented
					options={[
						{ value: "tasks", label: t("tasks.title") },
						{ value: "scheduled", label: t("tasks.scheduled") },
					]}
					value={scheduled ? "scheduled" : "tasks"}
					onChange={(value) => onChange(value === "scheduled")}
					aria-label={t("nav.tasks")}
				/>
			}
		>
			{scheduled ? (
				<ScheduledList />
			) : (
				<EmptyState icon={<ListChecks size={24} strokeWidth={1.6} />} title={t("tasks.emptyTitle")} />
			)}
		</ListFrame>
	);
}

export function TaskPage({ taskId }: { taskId: string | null }) {
	const { t } = useTranslation();
	return (
		<PageFrame title={null}>
			{taskId ? (
				<div className="flex flex-1 items-center justify-center">
					<EmptyState icon={<ListChecks size={24} strokeWidth={1.6} />} title={t("tasks.emptyTitle")} />
				</div>
			) : null}
		</PageFrame>
	);
}

function ScheduledList() {
	const { t, i18n } = useTranslation();
	const schedules = useSchedules();
	const actions = useScheduleActions();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const [creating, setCreating] = useState(false);
	const items = schedules.data?.items ?? [];
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
			{creating ? (
				<ScheduleForm onCancel={() => setCreating(false)} onDone={() => setCreating(false)} />
			) : (
				<Button variant="secondary" onClick={() => setCreating(true)}>
					{t("tasks.newSchedule")}
				</Button>
			)}
			{items.length ? (
				<ListGroup>
					{items.map((item) => (
						<ScheduleRow
							key={item.id}
							schedule={item}
							locale={locale}
							busy={actions.pause.isPending || actions.resume.isPending || actions.remove.isPending}
							onPause={() => actions.pause.mutate(item.id)}
							onResume={() => actions.resume.mutate(item.id)}
							onDelete={() => actions.remove.mutate(item.id)}
						/>
					))}
				</ListGroup>
			) : !creating ? (
				<EmptyState icon={<CalendarClock size={24} strokeWidth={1.6} />} title={t("tasks.emptyScheduled")} />
			) : null}
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
