import type { SocialLibrary, SocialLibraryFolder } from "@yonder/protocol";
import { EmptyState, IconTile, ListGroup, ListRow, SearchInput } from "@yonder/ui-components";
import { FileClock, Files, FileText, Folder, Search } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { receptionFolderPath, receptionFolderTrail } from "./reception-library-paths.ts";
import { receptionSettingsPath } from "./settings-navigation.ts";

type Document = SocialLibrary["documents"][number];
type Draft = SocialLibrary["drafts"][number];
type Open = (path: string) => void;

const PAGE_SIZE = 20;
const RECENT_COUNT = 5;

export function receptionDraftTitle(draft: Draft, fallback: string) {
	const line =
		draft.content
			.trim()
			.split("\n", 1)[0]
			?.replace(/^#{1,6}\s+/, "")
			.trim() ?? "";
	return Array.from(line).slice(0, 50).join("") || fallback;
}

export function useReceptionDate() {
	const { i18n } = useTranslation();
	return new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium" });
}

function newestFirst(documents: readonly Document[]) {
	return documents.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function LimitedRows<T extends { id: string }>({
	items,
	selected,
	renderRow,
}: {
	items: readonly T[];
	selected?: string | undefined;
	renderRow: (item: T) => ReactNode;
}) {
	const { t } = useTranslation();
	const [shown, setShown] = useState(PAGE_SIZE);
	const rows = items.slice(0, shown);
	const selectedRow = items.slice(shown).find((item) => item.id === selected);
	if (selectedRow) rows.push(selectedRow);
	return (
		<>
			{rows.map(renderRow)}
			{items.length > rows.length ? (
				<ListRow title={t("members.social.library.showMore")} onClick={() => setShown((n) => n + PAGE_SIZE)} />
			) : null}
		</>
	);
}

export function ReceptionRootDirectory({
	library,
	selected,
	onOpen,
}: {
	library: SocialLibrary;
	selected?: string | undefined;
	onOpen: Open;
}) {
	const { t, i18n } = useTranslation();
	const [search, setSearch] = useState("");
	const needle = search.trim().toLocaleLowerCase();
	const ordered = useMemo(() => newestFirst(library.documents), [library.documents]);
	// ponytail: search the query's existing owner library snapshot in memory. Use server-side
	// search and cursor pagination if libraries grow beyond this bounded account snapshot.
	const results = useMemo(
		() =>
			needle
				? ordered.filter((document) => `${document.title}\n${document.content}`.toLocaleLowerCase().includes(needle))
				: [],
		[ordered, needle],
	);
	const large = ordered.length > PAGE_SIZE;
	const locale = i18n.resolvedLanguage ?? i18n.language;
	return (
		<div className="flex min-w-0 flex-col gap-[var(--spacing-3)]">
			{!selected && (ordered.length || search) ? (
				<SearchInput
					placeholder={t("members.social.library.search")}
					value={search}
					onChange={(event) => setSearch(event.target.value)}
				/>
			) : null}
			{needle ? (
				results.length ? (
					<ReceptionDocumentList
						key={needle}
						library={library}
						documents={results}
						kind="find"
						title={t("members.social.library.results", { count: results.length })}
						onOpen={onOpen}
					/>
				) : (
					<EmptyState icon={<Search size={24} />} title={t("members.social.library.noResults")} />
				)
			) : (
				<>
					<ListGroup>
						{large ? (
							<ListRow
								leading={
									<IconTile>
										<Files size={18} />
									</IconTile>
								}
								title={t("members.social.library.allDocuments")}
								trailing={new Intl.NumberFormat(locale).format(ordered.length)}
								selected={selected === "all"}
								chevron
								onClick={() => onOpen(receptionSettingsPath("all"))}
							/>
						) : null}
						<ReceptionFolderRows library={library} parentId={null} selected={selected} onOpen={onOpen} />
						{!large ? (
							<ReceptionDocumentRows
								library={library}
								documents={ordered.filter((document) => !document.folderId)}
								selected={selected}
								onOpen={onOpen}
							/>
						) : null}
						<ListRow
							leading={
								<IconTile>
									<FileClock size={18} />
								</IconTile>
							}
							title={t("members.social.draftsTitle")}
							trailing={library.drafts.length ? new Intl.NumberFormat(locale).format(library.drafts.length) : undefined}
							selected={selected === "drafts"}
							chevron
							onClick={() => onOpen(receptionSettingsPath("drafts"))}
						/>
					</ListGroup>
					{large ? (
						<ReceptionDocumentList
							library={library}
							documents={ordered.slice(0, RECENT_COUNT)}
							title={t("members.social.library.recentDocuments")}
							kind="find"
							onOpen={onOpen}
						/>
					) : null}
				</>
			)}
		</div>
	);
}

function ReceptionFolderRows({
	library,
	parentId,
	selected,
	onOpen,
}: {
	library: SocialLibrary;
	parentId: string | null;
	selected?: string | undefined;
	onOpen: Open;
}) {
	const { t } = useTranslation();
	return (
		<LimitedRows
			items={library.folders.filter((folder) => (folder.parentFolderId ?? null) === parentId)}
			selected={selected}
			renderRow={(folder) => (
				<ListRow
					key={folder.id}
					leading={
						<IconTile>
							<Folder size={18} className="text-[var(--color-accent-text)]" />
						</IconTile>
					}
					title={folder.name}
					subtitle={t("members.social.library.folderCount", {
						count:
							library.documents.filter((document) => document.folderId === folder.id).length +
							library.folders.filter((item) => item.parentFolderId === folder.id).length,
					})}
					selected={selected === folder.id}
					chevron
					onClick={() => onOpen(receptionFolderPath(receptionFolderTrail(library.folders, folder.id)))}
				/>
			)}
		/>
	);
}

export function ReceptionFolderContents({
	library,
	folder,
	selected,
	onOpen,
}: {
	library: SocialLibrary;
	folder: SocialLibraryFolder;
	selected?: string | undefined;
	onOpen: Open;
}) {
	const { t } = useTranslation();
	const documents = newestFirst(library.documents.filter((document) => document.folderId === folder.id));
	if (!documents.length && !library.folders.some((item) => item.parentFolderId === folder.id)) {
		return <EmptyState icon={<Folder size={24} />} title={t("members.social.library.emptyFolder")} />;
	}
	return (
		<ListGroup>
			<ReceptionFolderRows library={library} parentId={folder.id} selected={selected} onOpen={onOpen} />
			<ReceptionDocumentRows library={library} documents={documents} selected={selected} onOpen={onOpen} />
		</ListGroup>
	);
}

export function ReceptionDocumentList({
	title,
	library,
	documents,
	kind,
	selected,
	onOpen,
}: {
	title?: string | undefined;
	library: SocialLibrary;
	documents: readonly Document[];
	kind: "all" | "find";
	selected?: string | undefined;
	onOpen: Open;
}) {
	return (
		<ListGroup title={title}>
			<ReceptionDocumentRows
				library={library}
				documents={newestFirst(documents)}
				kind={kind}
				selected={selected}
				onOpen={onOpen}
			/>
		</ListGroup>
	);
}

function ReceptionDocumentRows({
	library,
	documents,
	kind,
	selected,
	onOpen,
}: {
	library: SocialLibrary;
	documents: readonly Document[];
	kind?: "all" | "find" | undefined;
	selected?: string | undefined;
	onOpen: Open;
}) {
	const { t } = useTranslation();
	const date = useReceptionDate();
	return (
		<LimitedRows
			items={documents}
			selected={selected}
			renderRow={(document) => {
				const trail = receptionFolderTrail(library.folders, document.folderId);
				return (
					<ListRow
						key={document.id}
						leading={
							<IconTile>
								<FileText size={18} />
							</IconTile>
						}
						title={document.title}
						subtitle={
							kind
								? trail.map((folder) => folder.name).join(" › ") || t("members.social.library.root")
								: date.format(new Date(document.updatedAt))
						}
						selected={selected === document.id}
						chevron
						onClick={() =>
							onOpen(kind ? receptionSettingsPath(kind, document.id) : receptionFolderPath(trail, document.id))
						}
					/>
				);
			}}
		/>
	);
}

export function ReceptionDraftList({
	drafts,
	selected,
	onOpen,
}: {
	drafts: readonly Draft[];
	selected?: string | undefined;
	onOpen: Open;
}) {
	const { t } = useTranslation();
	const date = useReceptionDate();
	if (!drafts.length) return <EmptyState icon={<FileClock size={24} />} title={t("members.social.noDrafts")} />;
	return (
		<ListGroup>
			<LimitedRows
				items={drafts}
				selected={selected}
				renderRow={(draft) => (
					<ListRow
						key={draft.id}
						leading={
							<IconTile>
								<FileClock size={18} />
							</IconTile>
						}
						title={receptionDraftTitle(draft, t("members.social.library.untitledDraft"))}
						subtitle={date.format(new Date(draft.createdAt))}
						selected={selected === draft.id}
						chevron
						onClick={() => onOpen(receptionSettingsPath("drafts", draft.id))}
					/>
				)}
			/>
		</ListGroup>
	);
}
