import { memberFailureText } from "@yonder/feature-members";
import type { SocialLibrary } from "@yonder/protocol";
import { Button, EmptyState } from "@yonder/ui-components";
import { useSocialLibrary } from "@yonder/ui-data";
import { PageFrame, useShellChrome } from "@yonder/ui-shell";
import { File, FilePlus, FolderPlus, Pencil } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { NotFoundPage } from "../pages/not-found-page.tsx";
import { ReceptionDocumentDetail, ReceptionDraftDetail } from "./reception-library-details.tsx";
import {
	ReceptionDraftList,
	ReceptionFolderDocuments,
	ReceptionRootDirectory,
} from "./reception-library-directory.tsx";
import { type Editor, ReceptionLibraryEditor } from "./reception-library-editor.tsx";
import { ReceptionSetting } from "./reception-setting.tsx";
import { receptionSettingsPath } from "./settings-navigation.ts";

type LibraryView =
	| { kind: "root" }
	| { kind: "folder"; id: string }
	| { kind: "document"; id: string; folderId: string | undefined }
	| { kind: "drafts"; id: string | undefined };

function readView(route: readonly string[]): LibraryView | null {
	const [page, id, leaf] = route;
	if (!page || ((page === "bot" || page === "info") && !id)) return { kind: "root" };
	if (page === "drafts" && !leaf) return { kind: "drafts", id };
	if (page === "document" && id && !leaf) return { kind: "document", id, folderId: undefined };
	if (page === "folder" && id && route.length <= 3)
		return leaf ? { kind: "document", id: leaf, folderId: id } : { kind: "folder", id };
	return null;
}

export function ReceptionLibraryPage({
	route,
	onOpen,
	onBack,
}: {
	route: readonly string[];
	onOpen: (path: string) => void;
	onBack: (path: string) => void;
}) {
	const view = readView(route);
	return view ? <ReceptionLibrary view={view} onOpen={onOpen} onBack={onBack} /> : <NotFoundPage />;
}

function ReceptionLibrary({
	view,
	onOpen,
	onBack,
}: {
	view: LibraryView;
	onOpen: (path: string) => void;
	onBack: (path: string) => void;
}) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const wide = mode === "wide";
	const library = useSocialLibrary();
	const folderId = view.kind === "folder" ? view.id : view.kind === "document" ? view.folderId : undefined;
	const folder = library.data?.folders.find((item) => item.id === folderId);
	const showTop = wide || view.kind === "root";
	const title = showTop
		? t("me.sections.reception")
		: view.kind === "drafts"
			? t("members.social.draftsTitle")
			: (folder?.name ?? t("members.social.infoTitle"));

	return (
		<PageFrame title={<h1 className="truncate">{title}</h1>}>
			<div className="flex min-w-0 flex-col gap-[var(--spacing-6)]">
				{showTop ? <ReceptionSetting /> : null}
				{library.isPending ? (
					<p role="status">{t("app.loading")}</p>
				) : library.data ? (
					<ReceptionLibraryBody library={library.data} view={view} wide={wide} onOpen={onOpen} onBack={onBack} />
				) : (
					<div className="flex flex-wrap items-center gap-[var(--spacing-2)]">
						<p role="alert" className="text-caption text-[var(--color-danger)]">
							{memberFailureText(library.error, t) || t("app.loadFailed")}
						</p>
						<Button variant="link" size="sm" onClick={() => void library.refetch()}>
							{t("app.retry")}
						</Button>
					</div>
				)}
			</div>
		</PageFrame>
	);
}

function ReceptionLibraryBody({
	library,
	view,
	wide,
	onOpen,
	onBack,
}: {
	library: SocialLibrary;
	view: LibraryView;
	wide: boolean;
	onOpen: (path: string) => void;
	onBack: (path: string) => void;
}) {
	const { t } = useTranslation();
	const [editor, setEditor] = useState<Editor | null>(null);
	const folder = library.folders.find((item) => item.id === (view.kind === "folder" ? view.id : undefined));
	const document = view.kind === "document" ? library.documents.find((item) => item.id === view.id) : undefined;
	const draft = view.kind === "drafts" ? library.drafts.find((item) => item.id === view.id) : undefined;
	const documentFolder = library.folders.find((item) => item.id === document?.folderId);
	const folderDocuments = library.documents.filter((item) => item.folderId === (folder?.id ?? documentFolder?.id));
	const backFromDocument = () =>
		onBack(
			view.kind === "document" && view.folderId
				? receptionSettingsPath("folder", view.folderId)
				: receptionSettingsPath(),
		);
	const backFromDraft = () => onBack(receptionSettingsPath("drafts"));
	const directory = <ReceptionRootDirectory library={library} onOpen={onOpen} />;
	const missing = <EmptyState icon={<File size={24} />} title={t("members.social.library.missing")} />;
	const newDocument = (folderId: string | null) => (
		<Button size="sm" onClick={() => setEditor({ document: null, folderId })}>
			<FilePlus size={16} aria-hidden />
			{t("members.social.library.newDocument")}
		</Button>
	);

	let content: ReactNode;
	switch (view.kind) {
		case "root":
			content = directory;
			break;
		case "folder":
			content = folder ? (
				<ReceptionSplit
					wide={wide}
					directory={<ReceptionRootDirectory library={library} selected={folder.id} onOpen={onOpen} />}
				>
					<div className="flex flex-col gap-[var(--spacing-3)]">
						<div className="flex flex-wrap items-center justify-between gap-[var(--spacing-2)]">
							{wide ? <h3 className="min-w-0 text-h3 font-semibold [overflow-wrap:anywhere]">{folder.name}</h3> : null}
							<div className="flex flex-wrap gap-[var(--spacing-2)]">
								{newDocument(folder.id)}
								<Button size="sm" variant="ghost" onClick={() => setEditor({ folder })}>
									<Pencil size={16} aria-hidden />
									{t("members.social.library.renameFolder")}
								</Button>
							</div>
						</div>
						<ReceptionFolderDocuments documents={folderDocuments} onOpen={onOpen} />
					</div>
				</ReceptionSplit>
			) : (
				missing
			);
			break;
		case "document":
			content = document ? (
				<ReceptionSplit
					wide={wide}
					directory={
						documentFolder ? (
							<div className="flex flex-col gap-[var(--spacing-2)]">
								<h3 className="px-[var(--spacing-2)] text-caption font-medium text-[var(--color-text-tertiary)] [overflow-wrap:anywhere]">
									{documentFolder.name}
								</h3>
								<ReceptionFolderDocuments documents={folderDocuments} selected={document.id} onOpen={onOpen} />
							</div>
						) : (
							<ReceptionRootDirectory library={library} selected={document.id} onOpen={onOpen} />
						)
					}
				>
					<ReceptionDocumentDetail
						document={document}
						onEdit={() => setEditor({ document, folderId: document.folderId })}
						onRemoved={backFromDocument}
					/>
				</ReceptionSplit>
			) : (
				missing
			);
			break;
		case "drafts": {
			const drafts = <ReceptionDraftList drafts={library.drafts} selected={draft?.id} onOpen={onOpen} />;
			content = draft ? (
				<ReceptionSplit wide={wide} directory={drafts}>
					<ReceptionDraftDetail key={draft.id} draft={draft} folders={library.folders} onReviewed={backFromDraft} />
				</ReceptionSplit>
			) : view.id ? (
				missing
			) : (
				<ReceptionSplit
					wide={wide}
					directory={<ReceptionRootDirectory library={library} selected="drafts" onOpen={onOpen} />}
				>
					{drafts}
				</ReceptionSplit>
			);
			break;
		}
	}

	return (
		<section data-reception-library className="flex min-w-0 flex-col gap-[var(--spacing-4)]">
			{wide || view.kind === "root" ? (
				<header className="flex flex-wrap items-center justify-between gap-[var(--spacing-2)]">
					<div className="min-w-0">
						<h2 className="text-h3 font-semibold">
							{t(view.kind === "drafts" ? "members.social.draftsTitle" : "members.social.infoTitle")}
						</h2>
						{view.kind === "root" ? (
							<p className="text-caption text-[var(--color-text-tertiary)]">{t("members.social.sharedByAll")}</p>
						) : null}
					</div>
					{view.kind === "root" ? (
						<div className="flex flex-wrap gap-[var(--spacing-2)]">
							<Button size="sm" onClick={() => setEditor({ folder: null })}>
								<FolderPlus size={16} aria-hidden />
								{t("members.social.library.newFolder")}
							</Button>
							{newDocument(null)}
						</div>
					) : null}
				</header>
			) : null}
			{content}
			{editor ? (
				<ReceptionLibraryEditor
					initial={editor}
					folders={library.folders}
					onClose={() => setEditor(null)}
					onMoved={backFromDocument}
				/>
			) : null}
		</section>
	);
}

function ReceptionSplit({ wide, directory, children }: { wide: boolean; directory: ReactNode; children: ReactNode }) {
	return wide ? (
		<div className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-[var(--spacing-4)]">
			<div data-reception-directory className="min-w-0">
				{directory}
			</div>
			<div data-reception-detail className="min-w-0 border-s border-[var(--color-border-subtle)] ps-[var(--spacing-4)]">
				{children}
			</div>
		</div>
	) : (
		<div data-reception-detail className="min-w-0">
			{children}
		</div>
	);
}
