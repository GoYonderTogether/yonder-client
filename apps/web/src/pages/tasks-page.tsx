import { EmptyState, ListGroup, Segmented } from "@yonder/ui-components";
import { type useItemSession, useSchedules } from "@yonder/ui-data";
import { ListFrame, PageFrame } from "@yonder/ui-shell";
import { ListChecks } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GoalsTab } from "./goal-records.tsx";
import { ItemDetailPage } from "./items-detail.tsx";
import type { PresetSource } from "./items-fly.tsx";
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
	onSchedule,
	showManualSchedule,
}: {
	scheduled: boolean;
	onChange: (scheduled: boolean) => void;
	onOpenItem: (id: string) => void;
	/** On 「目标」 it opens the goal draft; on 「事项」 it opens a blank session. */
	onAdd: (source?: PresetSource) => void;
	onSchedule: (source: PresetSource) => void;
	/** A phone hides the manual schedule form, because its creation always starts from the main Bot. */
	showManualSchedule: boolean;
}) {
	const { t } = useTranslation();
	const [creating, setCreating] = useState(false);
	return (
		<ListFrame
			title={t("nav.tasks")}
			action={
				<TaskActions
					onAdd={onAdd}
					onCreateSchedule={onSchedule}
					onCreateScheduleManually={
						showManualSchedule
							? () => {
									// The inline form lives in 「目标」, so a manual schedule started from 「事项」
									// takes the person there before it opens.
									if (!scheduled) onChange(true);
									setCreating(true);
								}
							: undefined
					}
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
				<ItemsList onOpen={onOpenItem} />
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
