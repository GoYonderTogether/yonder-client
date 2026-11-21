import { memberFailureText } from "@yonder/feature-members";
import type { SocialLibrary, SocialLibraryFolder } from "@yonder/protocol";
import { Button, EmptyState } from "@yonder/ui-components";
import { useMemoryOrganization, useSocialLibrary } from "@yonder/ui-data";
import { PageFrame, useShellChrome } from "@yonder/ui-shell";
import { File, FilePlus, FolderPlus, Pencil, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { NotFoundPage } from "../pages/not-found-page.tsx";
import { ReceptionDocumentDetail, ReceptionDraftDetail } from "./reception-library-details.tsx";
import {
	ReceptionDocumentList,
	ReceptionDraftList,
	ReceptionFolderContents,
	ReceptionRootDirectory,
} from "./reception-library-directory.tsx";
import { ReceptionDragProvider, receptionDropHighlight, useReceptionDrag } from "./reception-library-drag.tsx";
import { type Editor, ReceptionLibraryEditor, ReceptionRemoveButton } from "./reception-library-editor.tsx";
import {
	receptionFolderLabel,
	receptionFolderPath,
	receptionFolderTrail,
	receptionWritablePath,
} from "./reception-library-paths.ts";
import { ReceptionOrganization } from "./reception-organization.tsx";
import { ReceptionSetting } from "./reception-setting.tsx";
import { receptionFolderRoute, receptionSettingsPath } from "./settings-navigation.ts";

type LibraryView =
	| { kind: "root" }
	| { kind: "folder"; id: string }
	| { kind: "all" }
	| { kind: "document"; id: string; source: "all" | "find" | undefined }
	| { kind: "drafts"; id: string | undefined };

function readView(route: readonly string[]): LibraryView | null {
	const [page, id, leaf] = route;
	if (!page || ((page === "bot" || page === "info") && !id)) return { kind: "root" };
	if (page === "drafts" && !leaf) return { kind: "drafts", id };
	if (page === "all" && !id) return { kind: "all" };
	if ((page === "document" || page === "all" || page === "find") && id && !leaf)
		return { kind: "document", id, source: page === "document" ? undefined : page };
	if (page === "folder") {
		const path = receptionFolderRoute(route);
		const folderId = path.folderIds.at(-1);
		if (path.valid && folderId)
			return path.leaf ? { kind: "document", id: path.leaf, source: undefined } : { kind: "folder", id: folderId };
	}
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
	if (route.length === 1 && route[0] === "organization") return <ReceptionOrganization onOpen={onOpen} />;
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
	const folderId =
		view.kind === "folder"
			? view.id
			: view.kind === "document"
				? library.data?.documents.find((item) => item.id === view.id)?.folderId
				: undefined;
	const folder = library.data?.folders.find((item) => item.id === folderId);
	const showTop = wide || view.kind === "root";
	const title = showTop
		? t("me.sections.reception")
		: view.kind === "drafts"
			? t("members.social.draftsTitle")
			: view.kind === "all"
				? t("members.social.library.allDocuments")
				: folder
					? receptionFolderLabel(folder, t)
					: t("members.social.infoTitle");

	return (
		<PageFrame title={<h1 className="truncate">{title}</h1>}>
			<div className="flex min-w-0 flex-col gap-[var(--spacing-6)]">
				{showTop ? <ReceptionSetting /> : null}
				{library.isPending ? (
					<p role="status">{t("app.loading")}</p>
				) : library.data ? (
					<ReceptionDragProvider library={library.data}>
						<ReceptionLibraryBody library={library.data} view={view} wide={wide} onOpen={onOpen} onBack={onBack} />
					</ReceptionDragProvider>
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
	const folderTrail = receptionFolderTrail(library.folders, folder?.id ?? documentFolder?.id);
	const parentFolder = folderTrail.at(-2);
	const backFromFolder = () => onBack(receptionFolderPath(folderTrail.slice(0, -1)));
	const backFromDocument = () =>
		onBack(
			view.kind === "document" && view.source
				? receptionSettingsPath(...(view.source === "all" ? ["all"] : []))
				: receptionFolderPath(folderTrail),
		);
	const backFromDraft = () => onBack(receptionSettingsPath("drafts"));
	const directory = <ReceptionRootDirectory library={library} onOpen={onOpen} />;
	const missing = <EmptyState icon={<File size={24} />} title={t("members.social.library.missing")} />;
	const newFolder = (parentFolderId: string | null) => (
		<Button size="sm" onClick={() => setEditor({ folder: null, parentFolderId })}>
			<FolderPlus size={16} aria-hidden />
			{t("members.social.library.newFolder")}
		</Button>
	);
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
		case "all":
			content = (
				<ReceptionDocumentList
					title={wide ? t("members.social.library.allDocuments") : undefined}
					library={library}
					documents={library.documents}
					kind="all"
					onOpen={onOpen}
				/>
			);
			break;
		case "folder":
			content = folder ? (
				<ReceptionSplit
					wide={wide}
					directory={
						parentFolder ? (
							<ReceptionFolderContents library={library} folder={parentFolder} selected={folder.id} onOpen={onOpen} />
						) : (
							<ReceptionRootDirectory library={library} selected={folder.id} onOpen={onOpen} />
						)
					}
				>
					<div className="flex flex-col gap-[var(--spacing-3)]">
						<div className="flex flex-wrap items-center justify-between gap-[var(--spacing-2)]">
							{wide ? (
								<h3 className="min-w-0 text-h3 font-semibold [overflow-wrap:anywhere]">
									{receptionFolderLabel(folder, t)}
								</h3>
							) : null}
							{receptionWritablePath(folder.path) ? (
								<div className="flex flex-wrap gap-[var(--spacing-2)]">
									{newDocument(folder.id)}
									{newFolder(folder.id)}
									{folder.path !== "/notes" ? (
										<>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => setEditor({ folder, parentFolderId: folder.parentFolderId ?? null })}
											>
												<Pencil size={16} aria-hidden />
												{t("members.social.library.renameFolder")}
											</Button>
											<ReceptionRemoveButton
												folderParent={
													parentFolder ? receptionFolderLabel(parentFolder, t) : t("members.social.library.root")
												}
												id={folder.id}
												title={folder.name}
												onRemoved={backFromFolder}
											/>
										</>
									) : null}
								</div>
							) : null}
						</div>
						<ReceptionFolderContents library={library} folder={folder} onOpen={onOpen} />
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
									{receptionFolderLabel(documentFolder, t)}
								</h3>
								<ReceptionFolderContents
									library={library}
									folder={documentFolder}
									selected={document.id}
									onOpen={onOpen}
								/>
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
							<ReceptionOrganizationEntry onOpen={() => onOpen(receptionSettingsPath("organization"))} />
							{newFolder(null)}
							{newDocument(null)}
						</div>
					) : null}
				</header>
			) : null}
			{folderTrail.length ? (
				<ReceptionBreadcrumbs trail={folderTrail} currentFolder={view.kind === "folder"} onOpen={onOpen} />
			) : null}
			{content}
			{editor ? (
				<ReceptionLibraryEditor
					initial={editor}
					folders={library.folders}
					onClose={() => setEditor(null)}
					onMoved={view.kind === "folder" ? backFromFolder : backFromDocument}
				/>
			) : null}
		</section>
	);
}

function ReceptionOrganizationEntry({ onOpen }: { onOpen: () => void }) {
	const { t } = useTranslation();
	const { data } = useMemoryOrganization();
	return (
		<Button size="sm" variant={data?.plan ? "primary" : "secondary"} onClick={onOpen}>
			<Sparkles size={16} aria-hidden />
			{t(data?.plan ? "members.social.organization.review" : "members.social.organization.title")}
		</Button>
	);
}

function ReceptionBreadcrumbs({
	trail,
	currentFolder,
	onOpen,
}: {
	trail: readonly SocialLibraryFolder[];
	currentFolder: boolean;
	onOpen: (path: string) => void;
}) {
	const { t } = useTranslation();
	const drag = useReceptionDrag();
	const linkClass = `min-w-0 break-all text-start text-[var(--color-accent-text)] hover:underline ${receptionDropHighlight}`;
	return (
		<nav
			aria-label={t("members.social.library.folderPath")}
			className="flex flex-wrap items-baseline gap-[var(--spacing-2)] text-caption"
		>
			<button
				type="button"
				className={linkClass}
				onClick={() => onOpen(receptionSettingsPath())}
				{...drag?.target(null)}
			>
				{t("members.social.library.root")}
			</button>
			{trail.map((folder, index) => (
				<span key={folder.id} className="inline-flex min-w-0 items-baseline gap-[var(--spacing-2)]">
					<span aria-hidden="true">›</span>
					{currentFolder && index === trail.length - 1 ? (
						<span
							aria-current="page"
							className={`break-all text-[var(--color-text-tertiary)] ${receptionDropHighlight}`}
							{...drag?.target(folder)}
						>
							{receptionFolderLabel(folder, t)}
						</span>
					) : (
						<button
							type="button"
							className={linkClass}
							onClick={() => onOpen(receptionFolderPath(trail.slice(0, index + 1)))}
							{...drag?.target(folder)}
						>
							{receptionFolderLabel(folder, t)}
						</button>
					)}
				</span>
			))}
		</nav>
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
