import { EmptyState } from "@yonder/ui-components";
import { usePerson } from "@yonder/ui-data";
import { ListFrame, PageFrame, useShellChrome } from "@yonder/ui-shell";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { MemoryFilePage } from "./memory/memory-file.tsx";
import { MemoryFileList } from "./memory/memory-file-list.tsx";
import { MemoryColumn, MemoryHome, useGroupName } from "./memory/memory-home.tsx";
import { MemoryTimeline } from "./memory/memory-timeline.tsx";
import { type MemoryView, memoryFileParent, memoryFileRoute, memoryFolderRoute } from "./memory/memory-view.ts";
import "./memory/memory.css";
import "./memory/memory-entry.css";
import "./memory/memory-drawer.css";
import "./memory/memory-overlay.css";

/**
 * The list column (11-19 layout). Narrower windows read the whole home here: the card, the latest
 * of the timeline, then every group; what it opens covers it as a detail. A wide window keeps the
 * card and the group list here and shows the selection on the white page beside it.
 */
export function MemoryList({ view }: { view: MemoryView }) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const person = usePerson();
	const selected =
		view.kind === "group" ? view.group : view.kind === "home" || view.kind === "timeline" ? "timeline" : "";
	return (
		<ListFrame title={t("nav.memory")}>
			{mode === "wide" ? <MemoryColumn key={person?.id} selected={selected} /> : <MemoryHome key={person?.id} />}
		</ListFrame>
	);
}

export function MemoryPage({ view }: { view: MemoryView }) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const navigate = useNavigate();
	const person = usePerson();
	const groupName = useGroupName();
	if (view.kind === "file")
		return (
			<PageFrame>
				<MemoryFilePage
					key={`${person?.id}:${view.path}`}
					path={view.path}
					onDeleted={() => navigate(memoryFileParent(view.path))}
				/>
			</PageFrame>
		);
	if (view.kind === "group")
		return (
			<PageFrame title={view.directory?.split("/").at(-1) || groupName(view.group)}>
				<MemoryFileList
					key={`${person?.id}:${view.group}/${view.directory ?? ""}`}
					group={view.group}
					directory={view.directory}
					current={null}
					onOpen={(path) => navigate(memoryFileRoute(path))}
					onFolder={(path) => navigate(memoryFolderRoute(view.group, path))}
				/>
			</PageFrame>
		);
	if (view.kind === "timeline" || mode === "wide")
		return (
			<PageFrame title={t("memory.timeline")}>
				<MemoryTimeline key={person?.id} />
			</PageFrame>
		);
	return (
		<div className="flex flex-1 items-center justify-center">
			<EmptyState icon={<FileText size={24} strokeWidth={1.6} />} title={t("nav.memory")} />
		</div>
	);
}
