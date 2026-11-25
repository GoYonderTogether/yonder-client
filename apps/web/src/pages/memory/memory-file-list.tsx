import type { MemoryFileSummary } from "@yonder/protocol";
import { EmptyState, ListGroup, ListRow } from "@yonder/ui-components";
import { useMemoryFiles, useMemoryFolders } from "@yonder/ui-data";
import { Folder } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMinute } from "./memory-format.ts";
import { MemoryError, MemoryLoading } from "./memory-status.tsx";
import { archivedFolderName, groupPrefix, isArchivedMemoryFile, memoryFolderNames } from "./memory-view.ts";
import { VisibilityMark } from "./memory-visibility.tsx";
import { relativeTime } from "./memory-who.ts";

const DIGEST_GROUPS: Record<string, string> = {
	day: "memory.digestDay",
	week: "memory.digestWeek",
	month: "memory.digestMonth",
};

interface Group {
	key: string;
	/** The top group's name, shown once above its first list. */
	heading: string;
	/** A sub-group's name: a connector's folder or a summary period. */
	title?: string;
	files: MemoryFileSummary[];
}

/**
 * Files grouped by what they are, named rather than shown as paths (24 第五节): notes, sources (one
 * group per connector, named by its folder), summaries (daily, weekly, monthly) and public, then
 * archived files last. Archived files keep their original path under `/archive/`, so they are in
 * none of the four groups and their folders mirror what they were archived from.
 */
export function groupFiles(
	files: readonly MemoryFileSummary[],
	t: (key: string) => string,
	folderName: (path: string) => string = (path) => path.slice(path.lastIndexOf("/") + 1) || path,
): Group[] {
	const newest = (items: MemoryFileSummary[]) => items.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	const live = files.filter((file) => !isArchivedMemoryFile(file.path));
	const under = (prefix: string) => live.filter((file) => file.path.startsWith(prefix));
	const split = (prefix: string) => {
		const groups = new Map<string, MemoryFileSummary[]>();
		for (const file of under(prefix)) {
			const name = file.path.slice(prefix.length).split("/")[0] ?? "";
			groups.set(name, [...(groups.get(name) ?? []), file]);
		}
		return groups;
	};
	const result: Group[] = [];
	const notes = under("/notes/");
	if (notes.length) result.push({ key: "notes", heading: folderName("/notes"), files: newest(notes) });
	for (const [name, items] of split("/sources/"))
		result.push({
			key: `sources:${name}`,
			heading: folderName("/sources"),
			title: folderName(`/sources/${name}`),
			files: newest(items),
		});
	const digests = split("/digests/");
	for (const period of Object.keys(DIGEST_GROUPS)) {
		const items = digests.get(period);
		if (items?.length)
			result.push({
				key: `digests:${period}`,
				heading: folderName("/digests"),
				title: folderName(`/digests/${period}`),
				files: newest(items),
			});
	}
	const published = under("/public/");
	if (published.length) result.push({ key: "public", heading: folderName("/public"), files: newest(published) });
	const archived = files.filter((file) => isArchivedMemoryFile(file.path));
	if (archived.length) result.push({ key: "archived", heading: t("memory.archivedFolder"), files: newest(archived) });
	return result;
}

/** One group's files (a connector, notes, summaries, public); summaries keep their period sub-lists. */
export function MemoryFileList({
	group,
	directory,
	current,
	onOpen,
	onFolder,
}: {
	group: string;
	directory?: string | undefined;
	current: string | null;
	onOpen: (path: string) => void;
	onFolder: (path: string) => void;
}) {
	const { t, i18n } = useTranslation();
	const now = useMinute();
	const query = useMemoryFiles();
	const folders = useMemoryFolders();
	const folderName = memoryFolderNames(folders.data?.items ?? []);
	const locale = i18n.resolvedLanguage ?? i18n.language;
	if (query.error) return <MemoryError error={query.error} retry={() => void query.refetch()} />;
	if (query.isPending) return <MemoryLoading />;
	const prefix = groupPrefix(group);
	const directoryPrefix = prefix && `${prefix}${directory ? `${directory}/` : ""}`;
	const matches = directoryPrefix ? query.data.items.filter((file) => file.path.startsWith(directoryPrefix)) : [];
	// Archived files are the group itself rather than a sub-group of anything; every other group is
	// split by what its files are.
	const groups: Group[] = directoryPrefix
		? group === "archived"
			? [{ key: "archived", heading: t("memory.archivedFolder"), files: matches }]
			: groupFiles(matches, t)
		: [];
	if (!directoryPrefix || !groups.length || (group === "archived" && !matches.length))
		return <EmptyState icon={<Folder size={24} strokeWidth={1.6} />} title={t("memory.noFiles")} />;
	return (
		<div className="flex flex-col gap-[var(--spacing-5)] py-[var(--spacing-2)]">
			{groups.map((sub) => {
				const first = (file: MemoryFileSummary) => file.path.slice(directoryPrefix.length).split("/");
				const folders =
					group === "digests"
						? []
						: [
								...new Set(
									sub.files.flatMap((file) => {
										const [name, next] = first(file);
										return name && next ? [name] : [];
									}),
								),
							].toSorted((a, b) => a.localeCompare(b, locale));
				const files = group === "digests" ? sub.files : sub.files.filter((file) => first(file).length === 1);
				return (
					<ListGroup key={sub.key} title={sub.key.startsWith("digests:") ? sub.title : undefined}>
						{folders.map((folder) => (
							<ListRow
								key={`folder:${folder}`}
								title={
									group === "archived" && !directory
										? archivedFolderName(folder, folderName)
										: group === "archived"
											? archivedFolderName(folder, folderName)
											: folderName(`${prefix}${directory ? `${directory}/` : ""}${folder}`) || folder
								}
								leading={<Folder size={18} aria-hidden />}
								chevron
								onClick={() => onFolder(directory ? `${directory}/${folder}` : folder)}
							/>
						))}
						{files.map((file) => (
							<ListRow
								key={file.path}
								title={file.title || file.path.split("/").at(-1)}
								subtitle={relativeTime(file.updatedAt, now, locale, t("memory.justNow"))}
								trailing={
									<span className="flex items-center gap-[var(--spacing-2)]">
										{file.draft ? <span className="text-[var(--color-warning)]">{t("memory.pending")}</span> : null}
										<VisibilityMark visibility={file.visibility} />
									</span>
								}
								selected={file.path === current}
								onClick={() => onOpen(file.path)}
							/>
						))}
					</ListGroup>
				);
			})}
		</div>
	);
}
