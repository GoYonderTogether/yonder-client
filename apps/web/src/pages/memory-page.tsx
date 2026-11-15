import { EmptyState, Segmented } from "@yonder/ui-components";
import { ListFrame, PageFrame } from "@yonder/ui-shell";
import { BookMarked, Folder } from "lucide-react";
import { useTranslation } from "react-i18next";

export function MemoryList({ files, onChange }: { files: boolean; onChange: (files: boolean) => void }) {
	const { t } = useTranslation();
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
			<EmptyState
				icon={files ? <Folder size={24} strokeWidth={1.6} /> : <BookMarked size={24} strokeWidth={1.6} />}
				title={t("memory.emptyTitle")}
			/>
		</ListFrame>
	);
}

export function MemoryPage() {
	return <PageFrame title={null}>{null}</PageFrame>;
}
