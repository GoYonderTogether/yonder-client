import { IconButton, ListGroup, ListValue, Menu } from "@yonder/ui-components";
import { ApiError, useScheduleActions, useSchedules } from "@yonder/ui-data";
import { ConfirmDialog } from "@yonder/ui-shell";
import { Ellipsis } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { describePlan, formatInstant, resultWord } from "./schedule-format.ts";

/** One recurring plan, opened from the goals tab: what it does, when, and how its last runs went. */
export function SchedulePanel({ scheduleId }: { scheduleId: string }) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const schedules = useSchedules();
	const actions = useScheduleActions();
	const [deleting, setDeleting] = useState(false);
	const schedule = schedules.data?.items.find((item) => item.id === scheduleId);
	if (!schedule)
		return (
			<p className="p-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)]">
				{schedules.isError ? t("app.loadFailed") : t("app.loading")}
			</p>
		);
	const paused = schedule.status === "paused";
	const finished = schedule.status === "ended" || schedule.status === "missed";
	const refused = [actions.pause, actions.resume, actions.remove].find((action) => action.isError);
	const failure = refused
		? refused.error instanceof ApiError
			? t(refused.error.messageKey)
			: t("tasks.actionFailed")
		: null;
	const items = [
		...(finished ? [] : [{ id: paused ? "resume" : "pause", label: t(paused ? "tasks.resume" : "tasks.pause") }]),
		{ id: "delete", label: t("tasks.delete"), tone: "danger" as const },
	];
	const busy = actions.pause.isPending || actions.resume.isPending || actions.remove.isPending;
	return (
		<div className="flex flex-col gap-[var(--spacing-4)] p-[var(--spacing-4)]">
			<div className="flex items-start justify-between gap-[var(--spacing-3)]">
				<div className="flex min-w-0 flex-col gap-[var(--spacing-1)]">
					<p className="text-body text-[var(--color-text-primary)]">
						{describePlan(schedule, t)} · {schedule.timezone}
					</p>
					{schedule.nextRunAt ? (
						<p className="text-caption text-[var(--color-text-secondary)]">
							{t("tasks.nextRun", { at: formatInstant(schedule.timezone, schedule.nextRunAt, locale) })}
						</p>
					) : null}
				</div>
				<Menu
					label={t("app.more")}
					align="end"
					items={items}
					onSelect={(id) => {
						if (id === "delete") return setDeleting(true);
						if (id === "pause") actions.pause.mutate(schedule.id);
						if (id === "resume") actions.resume.mutate(schedule.id);
					}}
					trigger={(props) => (
						<IconButton {...props} size="sm" aria-label={t("app.more")} disabled={busy}>
							<Ellipsis size={18} aria-hidden="true" />
						</IconButton>
					)}
				/>
			</div>
			{failure ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{failure}
				</p>
			) : null}
			{schedule.recentRuns.length ? (
				<ListGroup title={t("tasks.runsTitle")}>
					{schedule.recentRuns.slice(0, 5).map((run) => (
						<ListValue
							key={run.id}
							title={formatInstant(schedule.timezone, run.scheduledFor, locale)}
							value={run.result ? resultWord(run.result, t) : ""}
						/>
					))}
				</ListGroup>
			) : null}
			<ConfirmDialog
				open={deleting}
				title={t("tasks.delete")}
				body={schedule.title}
				confirmLabel={t("tasks.delete")}
				cancelLabel={t("app.cancel")}
				closeLabel={t("app.close")}
				backLabel={t("app.back")}
				busy={actions.remove.isPending}
				onCancel={() => setDeleting(false)}
				onConfirm={() => {
					actions.remove.mutate(schedule.id);
					setDeleting(false);
				}}
			/>
		</div>
	);
}
