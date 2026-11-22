import { EmptyState, ListGroup, Segmented } from "@yonder/ui-components";
import { type useItemSession, useSchedules } from "@yonder/ui-data";
import { ListFrame, PageFrame } from "@yonder/ui-shell";
import { ListChecks } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GoalsTab } from "./goal-records.tsx";
import { ItemDetailPage } from "./items-detail.tsx";
import { upcomingOneOffs } from "./items-format.ts";
import { ItemsList } from "./items-list.tsx";
import { ScheduleForm } from "./schedule-form.tsx";
import { formatInstant } from "./schedule-format.ts";
import { TaskActions } from "./task-actions.tsx";

/**
 * 「事项 | 目标」 (16-3 第九节): the items tab is every finished or running piece of work, the goals
 * tab is what the Bot keeps watching. Creation lives in the title row; its menu offers an item, a
 * goal and a scheduled task on both tabs.
 */
export function TasksList({
	scheduled,
	onChange,
	onOpenItem,
	onAdd,
	onAddGoal,
	onSchedule,
}: {
	scheduled: boolean;
	onChange: (scheduled: boolean) => void;
	onOpenItem: (id: string) => void;
	onAdd: () => void;
	onAddGoal: () => void;
	onSchedule?: (() => void) | undefined;
}) {
	const { t } = useTranslation();
	const [creating, setCreating] = useState(false);
	return (
		<ListFrame
			title={t("nav.tasks")}
			action={
				<TaskActions
					onAdd={onAdd}
					onAddGoal={onAddGoal}
					onCreateSchedule={() => {
						if (onSchedule) return onSchedule();
						// The inline form lives in 「目标」, so a schedule started from 「事项」 takes the person there.
						if (!scheduled) onChange(true);
						setCreating(true);
					}}
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
					<GoalsTab creating={creating} />
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
	session,
	disconnected,
	readActive,
	onOpenConversation,
}: {
	taskId: string | null;
	session: ReturnType<typeof useItemSession>;
	disconnected: boolean;
	readActive: boolean;
	onOpenConversation: (id: string) => void;
}) {
	const { t } = useTranslation();
	if (taskId === "new")
		return (
			<PageFrame title={<h1 className="truncate">{t("tasks.newItemHeading")}</h1>} titleAlign="start">
				<div className="flex flex-1 items-center justify-center">
					<EmptyState title={t("chat.emptyTitle")} />
				</div>
			</PageFrame>
		);
	if (taskId)
		return (
			<ItemDetailPage
				key={taskId}
				itemId={taskId}
				session={session}
				disconnected={disconnected}
				readActive={readActive}
				onOpenConversation={onOpenConversation}
			/>
		);
	return (
		<PageFrame title={null}>
			<div className="flex flex-1 items-center justify-center">
				<EmptyState icon={<ListChecks size={24} strokeWidth={1.6} />} title={t("tasks.emptyTitle")} />
			</div>
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
