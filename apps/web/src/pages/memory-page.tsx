import { Segmented } from "@yonder/ui-components";
import { usePerson } from "@yonder/ui-data";
import { ListFrame, Overlay, PageFrame, useShellChrome } from "@yonder/ui-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ABOUT_MEMORY, MemoryFile } from "./memory/memory-file.tsx";
import { MemoryFileTree } from "./memory/memory-file-tree.tsx";
import { MemoryTimeline } from "./memory/memory-timeline.tsx";
import "./memory/memory.css";
import "./memory/memory-entry.css";
import "./memory/memory-drawer.css";
import "./memory/memory-overlay.css";

const SECTIONS = { timeline: "memory.timeline", about: "memory.aboutMe", files: "memory.files" } as const;
type MemorySection = keyof typeof SECTIONS;

export function MemoryList({ section, onChange }: { section: MemorySection; onChange: (section: string) => void }) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	return (
		<ListFrame
			title={t("nav.memory")}
			center={
				<Segmented
					options={Object.entries(SECTIONS).map(([value, label]) => ({ value, label: t(label) }))}
					value={section}
					onChange={onChange}
					aria-label={t("nav.memory")}
				/>
			}
		>
			{mode !== "wide" ? <MemoryBody section={section} /> : null}
		</ListFrame>
	);
}

export function MemoryPage({ section }: { section: MemorySection }) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	return (
		<PageFrame title={t(SECTIONS[section])}>{mode === "wide" ? <MemoryBody section={section} /> : null}</PageFrame>
	);
}

function MemoryBody({ section }: { section: MemorySection }) {
	const person = usePerson();
	return section === "timeline" ? (
		<MemoryTimeline key={person?.id} />
	) : (
		<MemoryFilesSection key={`${section}:${person?.id ?? ""}`} section={section} owner={person?.kind === "person"} />
	);
}

function MemoryFilesSection({ section, owner }: { section: "about" | "files"; owner: boolean }) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const [open, setOpen] = useState<string>();
	const close = () => setOpen(undefined);
	return (
		<div className="memory-file-section">
			{section === "about" ? (
				ABOUT_MEMORY.map(({ path, label }) => (
					<MemoryFile key={path} path={path} title={t(label)} owner={owner} onOpen={setOpen} />
				))
			) : (
				<MemoryFileTree onOpen={setOpen} />
			)}
			{open ? (
				<Overlay open title={t("memory.file")} closeLabel={t("app.close")} mode={mode} onClose={close}>
					<div className="p-[var(--spacing-4)]">
						<MemoryFile key={open} path={open} title="" owner={owner} onOpen={setOpen} onDeleted={close} />
					</div>
				</Overlay>
			) : null}
		</div>
	);
}
