import { EmptyState, Segmented } from "@yonder/ui-components";
import { usePerson } from "@yonder/ui-data";
import { ListFrame, PageFrame, useShellChrome } from "@yonder/ui-shell";
import { Folder } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MemoryCards } from "./memory/memory-cards.tsx";
import { MemoryTimeline } from "./memory/memory-timeline.tsx";
import "./memory/memory.css";

export function MemoryList({ files, onChange }: { files: boolean; onChange: (files: boolean) => void }) {
	const { t } = useTranslation();
	const person = usePerson();
	const { mode } = useShellChrome();
	return (
		<ListFrame
			title={t("nav.memory")}
			center={
				<Segmented
					options={[
						{ value: "about", label: t("memory.aboutMe") },
						{ value: "files", label: t("memory.files") },
					]}
					value={files ? "files" : "about"}
					onChange={(value) => onChange(value === "files")}
					aria-label={t("nav.memory")}
				/>
			}
		>
			{files ? (
				<EmptyState icon={<Folder size={24} strokeWidth={1.6} />} title={t("memory.emptyTitle")} />
			) : (
				<div className="flex flex-col gap-[var(--spacing-8)] py-[var(--spacing-4)]">
					<MemoryCards key={person?.id ?? "loading"} {...(person ? { person } : {})} />
					{mode !== "wide" ? <MemoryTimeline /> : null}
				</div>
			)}
		</ListFrame>
	);
}

export function MemoryPage({ files = false }: { files?: boolean }) {
	const { t } = useTranslation();
	return <PageFrame title={files ? null : t("memory.aboutMe")}>{files ? null : <MemoryTimeline />}</PageFrame>;
}
