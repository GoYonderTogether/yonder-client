import { EmptyState } from "@yonder/ui-components";
import { useMemoryFolders, usePerson } from "@yonder/ui-data";
import { ListFrame, PageFrame, useShellChrome } from "@yonder/ui-shell";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { MemoryAbout } from "./memory/memory-about.tsx";
import { MemoryFilePage } from "./memory/memory-file.tsx";
import { MemoryFileList } from "./memory/memory-file-list.tsx";
import { MemoryColumn, MemoryHome, useGroupName } from "./memory/memory-home.tsx";
import { MemoryTimeline } from "./memory/memory-timeline.tsx";
import {
	archivedFolderName,
	groupPrefix,
	isInlineMemoryGroup,
	type MemoryView,
	memoryFileParent,
	memoryFileRoute,
	memoryFolderNames,
	memoryFolderRoute,
} from "./memory/memory-view.ts";
import "./memory/memory.css";
import "./memory/memory-entry.css";
import "./memory/memory-drawer.css";
import "./memory/memory-overlay.css";

/** A group page's title: a folder's own name, or the group's name when it is the group's root. */
function groupTitle(
	group: string,
	directory: string | undefined,
	groupName: (group: string) => string,
	folderName: (path: string) => string,
) {
	if (!directory) return groupName(group);
	// Each level's name comes from the server, so a system folder reads in the owner's language and a
	// renamed one keeps their word; the archived group is named by the folder it came from.
	const prefix = groupPrefix(group) ?? "";
	const names = directory.split("/").map((_, index, parts) => {
		const path = `${prefix}${parts.slice(0, index + 1).join("/")}`;
		return group === "archived" ? archivedFolderName(parts[index] ?? "", folderName) : folderName(path);
	});
	return names.at(-1) ?? "";
}

/**
 * The list column (11-19 layout). Narrower windows read the whole home here: the card, the latest
 * of the timeline, then every group; what it opens covers it as a detail. A wide window keeps the
 * card and the group list here and shows the selection on the white page beside it.
 */
export function MemoryList({ view }: { view: MemoryView }) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const person = usePerson();
	return (
		<ListFrame title={t("nav.memory")}>
			{mode === "wide" ? <MemoryColumn key={person?.id} view={view} /> : <MemoryHome key={person?.id} />}
		</ListFrame>
	);
}

export function MemoryPage({ view }: { view: MemoryView }) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const navigate = useNavigate();
	const person = usePerson();
	const groupName = useGroupName();
	const folders = useMemoryFolders();
	const folderName = memoryFolderNames(folders.data?.items ?? []);
	if (view.kind === "about") return <MemoryAbout key={person?.id} />;
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
	if (view.kind === "group" && (mode !== "wide" || !isInlineMemoryGroup(view.group)))
		return (
			<PageFrame title={groupTitle(view.group, view.directory, groupName, folderName)}>
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
