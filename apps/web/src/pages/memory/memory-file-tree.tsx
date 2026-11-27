import type { MemoryFileSummary } from "@yonder/protocol";
import { ListRow } from "@yonder/ui-components";
import { useMemoryFolders } from "@yonder/ui-data";
import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { memoryFileRoute, memoryFolderNames } from "./memory-view.ts";
import { VisibilityMark } from "./memory-visibility.tsx";

const ROW =
	"flex w-full items-center gap-[var(--spacing-1)] rounded-[var(--radius-sm)] py-[var(--spacing-1)] pe-[var(--spacing-2)] text-start text-body text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]";
const SELECTED = "bg-[var(--color-bg-selected)] hover:bg-[var(--color-bg-selected)] font-medium";

function indent(depth: number) {
	return { paddingInlineStart: `calc(var(--spacing-2) + ${depth} * var(--spacing-3))` };
}

function Slot({ children }: { children?: ReactNode }) {
	return (
		<span className="flex size-4 shrink-0 items-center justify-center text-[var(--color-text-tertiary)]">
			{children}
		</span>
	);
}

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
	const { i18n } = useTranslation();
	const navigate = useNavigate();
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

	function toggle(path: string) {
		const next = new Set(expanded);
		if (!next.delete(path)) next.add(path);
		setExpanded(next);
	}

	function level(path: string, entries: readonly MemoryFileSummary[], depth: number): ReactNode {
		const subfolders = new Map<string, MemoryFileSummary[]>();
		const leaves: MemoryFileSummary[] = [];
		for (const file of entries) {
			const slash = file.path.indexOf("/", path.length);
			if (slash === -1) {
				leaves.push(file);
				continue;
			}
			const child = file.path.slice(0, slash + 1);
			const siblings = subfolders.get(child);
			if (siblings) siblings.push(file);
			else subfolders.set(child, [file]);
		}
		return (
			<>
				{[...subfolders]
					.toSorted(([a], [b]) => folderName(a).localeCompare(folderName(b), locale))
					.map(([child, items]) => {
						const open = expanded.has(child);
						const Chevron = open ? ChevronDown : ChevronRight;
						return (
							<li key={child}>
								<button
									type="button"
									aria-expanded={open}
									className={ROW}
									style={indent(depth)}
									onClick={() => toggle(child)}
								>
									<Slot>
										<Chevron size={14} aria-hidden />
									</Slot>
									<span className="min-w-0 flex-1 truncate">{folderName(child)}</span>
								</button>
								{open ? <ul>{level(child, items, depth + 1)}</ul> : null}
							</li>
						);
					})}
				{leaves
					.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
					.map((file) => {
						const name = file.title || file.path.split("/").at(-1);
						const selected = activePath === file.path;
						return (
							<li key={file.path}>
								<button
									type="button"
									title={name}
									aria-current={selected ? "true" : undefined}
									className={`${ROW} ${selected ? SELECTED : ""}`}
									style={indent(depth)}
									onClick={() => navigate(memoryFileRoute(file.path))}
								>
									<Slot />
									<span className="min-w-0 flex-1 truncate">{name}</span>
									{file.draft ? <span className="shrink-0 text-caption text-[var(--color-warning)]">•</span> : null}
									<VisibilityMark visibility={file.visibility} />
								</button>
							</li>
						);
					})}
			</>
		);
	}

	const open = expanded.has(prefix);
	const Chevron = open ? ChevronDown : ChevronRight;
	return (
		<li className="border-b border-dashed border-[var(--color-border)] last:border-b-0">
			<ul>
				<ListRow
					title={title}
					leading={icon}
					trailing={
						<span className="flex items-center gap-[var(--spacing-2)]">
							{meta}
							<Chevron size={16} aria-hidden />
						</span>
					}
					aria-expanded={open}
					onClick={() => toggle(prefix)}
				/>
			</ul>
			{open ? (
				<ul className="px-[var(--spacing-2)] pb-[var(--spacing-2)]">
					{level(
						prefix,
						files.filter((file) => file.path.startsWith(prefix)),
						1,
					)}
				</ul>
			) : null}
		</li>
	);
}
