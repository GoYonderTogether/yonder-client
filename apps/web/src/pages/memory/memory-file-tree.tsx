import type { MemoryFileSummary } from "@yonder/protocol";
import { EmptyState, ListRow } from "@yonder/ui-components";
import { useMemoryFiles } from "@yonder/ui-data";
import { FileText, Folder } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MemoryError } from "./memory-status.tsx";
import { MemoryVisibility } from "./memory-visibility.tsx";

const ROOTS = {
	notes: "memory.notesFolder",
	sources: "memory.sourcesFolder",
	digests: "memory.digestsFolder",
	public: "memory.publicFolder",
} as const;

interface FolderNode {
	folders: Map<string, FolderNode>;
	files: MemoryFileSummary[];
}

function fileTree(files: MemoryFileSummary[]) {
	const tree: FolderNode = { folders: new Map(), files: [] };
	for (const file of files) {
		const folders = file.path.split("/").filter(Boolean).slice(0, -1);
		if (!folders[0] || !Object.hasOwn(ROOTS, folders[0])) continue;
		let folder = tree;
		for (const name of folders) {
			let next = folder.folders.get(name);
			if (!next) {
				next = { folders: new Map(), files: [] };
				folder.folders.set(name, next);
			}
			folder = next;
		}
		folder.files.push(file);
	}
	return tree;
}

export function MemoryFileTree({ onOpen }: { onOpen: (path: string) => void }) {
	const { t } = useTranslation();
	const query = useMemoryFiles();
	const tree = query.data ? fileTree(query.data.items) : null;
	return (
		<section className="memory-file-body" aria-label={t("memory.files")} aria-busy={query.isPending}>
			{query.error ? <MemoryError error={query.error} retry={() => void query.refetch()} /> : null}
			{query.isPending ? <p className="text-caption">{t("app.loading")}</p> : null}
			{tree?.folders.size ? (
				<Tree folder={tree} onOpen={onOpen} root />
			) : query.isSuccess ? (
				<EmptyState icon={<Folder className="size-[var(--spacing-6)]" />} title={t("memory.noFiles")} />
			) : null}
		</section>
	);
}

function Tree({
	folder,
	onOpen,
	root = false,
}: {
	folder: FolderNode;
	onOpen: (path: string) => void;
	root?: boolean;
}) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const folders = root
		? Object.keys(ROOTS).flatMap((name) => {
				const child = folder.folders.get(name);
				return child ? [[name, child] as const] : [];
			})
		: Array.from(folder.folders).sort(([a], [b]) => a.localeCompare(b, locale));
	return (
		<ul className="memory-file-tree">
			{folders.map(([name, child]) => (
				<li key={name}>
					<details>
						<summary>
							<Folder aria-hidden />
							{root ? t(ROOTS[name as keyof typeof ROOTS]) : name}
						</summary>
						<Tree folder={child} onOpen={onOpen} />
					</details>
				</li>
			))}
			{folder.files
				.toSorted((a, b) => a.path.localeCompare(b.path, locale))
				.map((file) => (
					<ListRow
						key={file.path}
						className="memory-file-tree-row"
						leading={<FileText className="size-[var(--spacing-4)]" aria-hidden />}
						title={file.title || file.path.split("/").at(-1)}
						trailing={<MemoryVisibility visibility={file.visibility} />}
						onClick={() => onOpen(file.path)}
					/>
				))}
		</ul>
	);
}
