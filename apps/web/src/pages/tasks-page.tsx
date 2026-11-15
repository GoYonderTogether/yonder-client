import { EmptyState, Segmented } from "@yonder/ui-components";
import { ListFrame, PageFrame } from "@yonder/ui-shell";
import { CalendarClock, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";

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
			<EmptyState
				icon={scheduled ? <CalendarClock size={24} strokeWidth={1.6} /> : <ListChecks size={24} strokeWidth={1.6} />}
				title={scheduled ? t("tasks.emptyScheduled") : t("tasks.emptyTitle")}
			/>
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
