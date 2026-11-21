import type { SocialLibrary } from "@yonder/protocol";
import { EmptyState, IconTile, ListGroup, ListRow } from "@yonder/ui-components";
import { FileClock, FileText, Folder } from "lucide-react";
import { useTranslation } from "react-i18next";
import { receptionSettingsPath } from "./settings-navigation.ts";

type Document = SocialLibrary["documents"][number];
type Draft = SocialLibrary["drafts"][number];

export function receptionDocumentPath(document: Document) {
	return document.folderId
		? receptionSettingsPath("folder", document.folderId, document.id)
		: receptionSettingsPath("document", document.id);
}

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

export function ReceptionRootDirectory({
	library,
	selected,
	onOpen,
}: {
	library: SocialLibrary;
	selected?: string | undefined;
	onOpen: (path: string) => void;
}) {
	const { t, i18n } = useTranslation();
	const date = useReceptionDate();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	return (
		<ListGroup>
			{library.folders.map((folder) => (
				<ListRow
					key={folder.id}
					leading={
						<IconTile>
							<Folder size={18} className="text-[var(--color-accent-text)]" />
						</IconTile>
					}
					title={folder.name}
					subtitle={t("members.social.library.folderCount", {
						count: library.documents.filter((document) => document.folderId === folder.id).length,
					})}
					selected={selected === folder.id}
					chevron
					onClick={() => onOpen(receptionSettingsPath("folder", folder.id))}
				/>
			))}
			{library.documents
				.filter((document) => !document.folderId)
				.map((document) => (
					<ReceptionDocumentRow
						key={document.id}
						document={document}
						date={date}
						selected={selected === document.id}
						onOpen={onOpen}
					/>
				))}
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
	);
}

export function ReceptionFolderDocuments({
	documents,
	selected,
	onOpen,
}: {
	documents: readonly Document[];
	selected?: string | undefined;
	onOpen: (path: string) => void;
}) {
	const { t } = useTranslation();
	const date = useReceptionDate();
	if (!documents.length)
		return <EmptyState icon={<Folder size={24} />} title={t("members.social.library.noDocuments")} />;
	return (
		<ListGroup>
			{documents.map((document) => (
				<ReceptionDocumentRow
					key={document.id}
					document={document}
					date={date}
					selected={selected === document.id}
					onOpen={onOpen}
				/>
			))}
		</ListGroup>
	);
}

function ReceptionDocumentRow({
	document,
	date,
	selected,
	onOpen,
}: {
	document: Document;
	date: Intl.DateTimeFormat;
	selected: boolean;
	onOpen: (path: string) => void;
}) {
	return (
		<ListRow
			leading={
				<IconTile>
					<FileText size={18} />
				</IconTile>
			}
			title={document.title}
			subtitle={date.format(new Date(document.updatedAt))}
			selected={selected}
			chevron
			onClick={() => onOpen(receptionDocumentPath(document))}
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
	onOpen: (path: string) => void;
}) {
	const { t } = useTranslation();
	const date = useReceptionDate();
	if (!drafts.length) return <EmptyState icon={<FileClock size={24} />} title={t("members.social.noDrafts")} />;
	return (
		<ListGroup>
			{drafts.map((draft) => (
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
			))}
		</ListGroup>
	);
}
