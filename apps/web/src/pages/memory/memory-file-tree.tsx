import type { MemoryFileSummary } from "@yonder/protocol";
import { ListRow } from "@yonder/ui-components";
import { useMemoryFolders } from "@yonder/ui-data";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MemoryFileRow } from "./memory-file-list.tsx";
import { useMinute } from "./memory-format.ts";
import { useOpenMemoryFile } from "./memory-navigation.ts";
import { memoryFolderNames } from "./memory-view.ts";
import { relativeTime } from "./memory-who.ts";

const CHILD_ROW = "min-h-[var(--control-lg)]!";

export function MemoryFileTree({
	prefix,
	title,
	icon,
	meta,
	files,
	activePath,
}: {
	prefix: string;
	title: string;
	icon: ReactNode;
	meta: ReactNode;
	files: readonly MemoryFileSummary[];
	activePath: string | null;
}) {
	const { t, i18n } = useTranslation();
	const now = useMinute();
	const openFile = useOpenMemoryFile();
	const folders = useMemoryFolders();
	const folderName = memoryFolderNames(folders.data?.items ?? []);
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

	useEffect(() => {
		if (!activePath?.startsWith(prefix)) return;
		const directories = activePath.slice(prefix.length).split("/").slice(0, -1);
		setExpanded((current) => {
			const next = new Set(current).add(prefix);
			let path = prefix;
			for (const directory of directories) {
				path += `${directory}/`;
				next.add(path);
			}
			return next;
		});
	}, [activePath, prefix]);

	function branch(path: string, entries: readonly MemoryFileSummary[]) {
		const open = expanded.has(path);
		const root = path === prefix;
		const Chevron = open ? ChevronDown : ChevronRight;
		const children = new Map<string, MemoryFileSummary[]>();
		const leaves: MemoryFileSummary[] = [];
		if (open) {
			for (const file of entries) {
				const slash = file.path.indexOf("/", path.length);
				if (slash === -1) {
					leaves.push(file);
				} else {
					const child = file.path.slice(0, slash + 1);
					const siblings = children.get(child);
					if (siblings) siblings.push(file);
					else children.set(child, [file]);
				}
			}
		}
		return (
			<li key={path} className="border-b border-dashed border-[var(--color-border)] last:border-b-0">
				<ul>
					<ListRow
						title={root ? title : folderName(path)}
						leading={root ? icon : <Folder size={16} aria-hidden />}
						trailing={
							<span className="flex items-center gap-[var(--spacing-2)]">
								{root ? meta : null}
								<Chevron size={16} aria-hidden />
							</span>
						}
						className={root ? undefined : CHILD_ROW}
						aria-expanded={open}
						onClick={() => {
							const next = new Set(expanded);
							if (open) next.delete(path);
							else next.add(path);
							setExpanded(next);
						}}
					/>
				</ul>
				{open ? (
					<ul className="ms-[var(--spacing-4)] border-s border-[var(--color-border)]">
						{[...children]
							.toSorted(([a], [b]) => folderName(a).localeCompare(folderName(b), locale))
							.map(([child, entries]) => branch(child, entries))}
						{leaves
							.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
							.map((file) => (
								<MemoryFileRow
									key={file.path}
									file={file}
									subtitle={relativeTime(file.updatedAt, now, locale, t("memory.justNow"))}
									selected={activePath === file.path}
									onClick={() => openFile(file.path)}
									className={CHILD_ROW}
								/>
							))}
					</ul>
				) : null}
			</li>
		);
	}

	return branch(
		prefix,
		files.filter((file) => file.path.startsWith(prefix)),
	);
}
