import { EmptyState, Segmented } from "@yonder/ui-components";
import { usePerson } from "@yonder/ui-data";
import { ListFrame, PageFrame, useShellChrome } from "@yonder/ui-shell";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { MemoryAbout } from "./memory/memory-about.tsx";
import { MemoryFilePage } from "./memory/memory-file.tsx";
import { MemoryFileList } from "./memory/memory-file-list.tsx";
import { memoryFileRoute } from "./memory/memory-navigation.ts";
import { MemoryTimeline } from "./memory/memory-timeline.tsx";
import "./memory/memory.css";
import "./memory/memory-entry.css";
import "./memory/memory-drawer.css";
import "./memory/memory-overlay.css";

/** The three sections (24 第二节); the timeline is the default, the one looked at every day. */
const SECTIONS = { timeline: "memory.timeline", about: "memory.aboutMe", files: "memory.files" } as const;
export type MemorySection = keyof typeof SECTIONS;

/**
 * The list column. On a wide window the timeline and 「了解」 read on the white detail page and the
 * column only holds the switch; 「文件」 keeps its list here and opens a file beside it. Narrower
 * windows read every section in this column, and a file covers it as a detail.
 */
export function MemoryList({
	section,
	file,
	onChange,
}: {
	section: MemorySection;
	file: string | null;
	onChange: (section: string) => void;
}) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const navigate = useNavigate();
	const person = usePerson();
	const inList = mode !== "wide" || section === "files";
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
			{inList ? (
				section === "files" ? (
					<MemoryFileList key={person?.id} current={file} onOpen={(path) => navigate(memoryFileRoute(path))} />
				) : (
					<SectionBody key={person?.id} section={section} />
				)
			) : null}
		</ListFrame>
	);
}

export function MemoryPage({ section, file }: { section: MemorySection; file: string | null }) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const navigate = useNavigate();
	const person = usePerson();
	if (file)
		return (
			<PageFrame>
				<MemoryFilePage key={`${person?.id}:${file}`} path={file} onDeleted={() => navigate("/memory/files")} />
			</PageFrame>
		);
	if (mode !== "wide") return <PageFrame>{null}</PageFrame>;
	if (section === "files")
		return (
			<div className="flex flex-1 items-center justify-center">
				<EmptyState icon={<FileText size={24} strokeWidth={1.6} />} title={t("memory.files")} />
			</div>
		);
	return (
		<PageFrame title={t(SECTIONS[section])}>
			<SectionBody key={person?.id} section={section} />
		</PageFrame>
	);
}

function SectionBody({ section }: { section: "timeline" | "about" }) {
	return section === "timeline" ? <MemoryTimeline /> : <MemoryAbout />;
}
