import { EmptyState, Segmented } from "@yonder/ui-components";
import type { useItemSession } from "@yonder/ui-data";
import { ListFrame, PageFrame } from "@yonder/ui-shell";
import { ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GoalsTab } from "./goal-records.tsx";
import { ItemDetailPage } from "./items-detail.tsx";
import { ItemsList } from "./items-list.tsx";
import { TaskActions } from "./task-actions.tsx";

/**
 * 「事项 | 目标」 (16-3 第九节): the items tab is every finished or running piece of work, the goals
 * tab is what the Bot keeps watching. 「+」 only asks the main Bot, with the sentence the segment
 * starts (2026-11-24).
 */
export function TasksList({
	scheduled,
	onChange,
	onOpenItem,
	onAddItem,
	onAddGoal,
}: {
	scheduled: boolean;
	onChange: (scheduled: boolean) => void;
	onOpenItem: (id: string) => void;
	/** 「+」 on 「事项」: the main Bot draft starts an item. */
	onAddItem: () => void;
	/** 「+」 on 「目标」: the main Bot draft starts a goal. */
	onAddGoal: () => void;
}) {
	const { t } = useTranslation();
	return (
		<ListFrame
			title={t("nav.tasks")}
			action={<TaskActions scheduled={scheduled} onAddItem={onAddItem} onAddGoal={onAddGoal} />}
			center={
				<Segmented
					options={[
						{ value: "items", label: t("tasks.title") },
						{ value: "goals", label: t("tasks.goals") },
					]}
					value={scheduled ? "goals" : "items"}
					onChange={(value) => onChange(value === "goals")}
					aria-label={t("nav.tasks")}
				/>
			}
		>
			{scheduled ? (
				<div className="flex flex-col gap-[var(--spacing-4)]">
					<GoalsTab />
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
