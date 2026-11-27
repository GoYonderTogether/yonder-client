import { IconButton, ListGroup, ListValue, Menu } from "@yonder/ui-components";
import { ApiError, useScheduleActions, useSchedules } from "@yonder/ui-data";
import { ConfirmDialog, useSidePanel } from "@yonder/ui-shell";
import { Ellipsis } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAskMainBot } from "../app/ask-main-bot.tsx";
import { describePlan, formatInstant, planStatusKey, resultWord } from "./schedule-format.ts";

/**
 * One recurring plan, opened from the goals tab: what it does, when, and how its last runs went.
 * Meta Muse is the reference (2026-11-24): the owner edits one by telling the main Bot (「编辑」 fills
 * the draft) or deletes it; pausing and resuming are the Bot's own tools. A plan the system stopped
 * says so in one word, with no control.
 */
export function SchedulePanel({ scheduleId }: { scheduleId: string }) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const side = useSidePanel();
	const ask = useAskMainBot();
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
	const status = planStatusKey(schedule.status);
	const failure = actions.remove.error
		? actions.remove.error instanceof ApiError
			? t(actions.remove.error.messageKey)
			: t("tasks.actionFailed")
		: null;
	const items = [
		{ id: "edit", label: t("app.edit") },
		{ id: "delete", label: t("tasks.delete"), tone: "danger" as const },
	];
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
					{status ? <p className="text-caption text-[var(--color-text-tertiary)]">{t(status)}</p> : null}
				</div>
				<Menu
					label={t("app.more")}
					align="end"
					items={items}
					onSelect={(id) => {
						if (id === "delete") return setDeleting(true);
						if (id === "edit") ask(t("tasks.presetScheduleEdit", { title: schedule.title }));
					}}
					trigger={(props) => (
						<IconButton {...props} size="sm" aria-label={t("app.more")} disabled={actions.remove.isPending}>
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
				title={t("tasks.deleteTitle", { title: schedule.title })}
				body={t("tasks.deleteIrreversible")}
				confirmLabel={t("tasks.delete")}
				cancelLabel={t("app.cancel")}
				closeLabel={t("app.close")}
				busy={actions.remove.isPending}
				onCancel={() => setDeleting(false)}
				onConfirm={() => {
					actions.remove.mutate(schedule.id, { onSuccess: () => void side.close() });
					setDeleting(false);
				}}
			/>
		</div>
	);
}
