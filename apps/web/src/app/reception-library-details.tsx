import type { SocialLibrary } from "@yonder/protocol";
import { Button, EmptyState, TextField } from "@yonder/ui-components";
import { useEditSocialLibrary, useMemoryFileActions, useSocialLibrary } from "@yonder/ui-data";
import { SidePageActions, useOptionalSidePanel } from "@yonder/ui-shell";
import { EyeOff, File, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DetailLinkAction } from "../lib/detail-link-action.tsx";
import { memoryFileRoute } from "../pages/memory/memory-view.ts";
import { MessageContent } from "../pages/message-content.tsx";
import { receptionDraftTitle, useReceptionDate } from "./reception-library-directory.tsx";
import {
	ReceptionFolderField,
	ReceptionLibraryEditor,
	ReceptionMutationError,
	ReceptionRemoveButton,
} from "./reception-library-editor.tsx";
import { receptionWritablePath } from "./reception-library-paths.ts";

export function ReceptionPane({ kind, id }: { kind: "document" | "draft"; id: string }) {
	const { t } = useTranslation();
	const { data, error, isPending, refetch } = useSocialLibrary();
	const side = useOptionalSidePanel();
	const [editor, setEditor] = useState<SocialLibrary["documents"][number] | null>(null);
	const close = () => side?.close();
	const document = kind === "document" ? data?.documents.find((item) => item.id === id) : undefined;
	const draft = kind === "draft" ? data?.drafts.find((item) => item.id === id) : undefined;
	return (
		<div className="p-[var(--spacing-4)]">
			{error ? (
				<>
					<ReceptionMutationError error={error} />
					<Button size="sm" variant="link" onClick={() => void refetch()}>
						{t("app.retry")}
					</Button>
				</>
			) : isPending ? (
				<p role="status">{t("app.loading")}</p>
			) : document && data ? (
				<>
					<ReceptionDocumentDetail document={document} onEdit={() => setEditor(document)} onRemoved={close} />
					{editor ? (
						<ReceptionLibraryEditor
							initial={{ document: editor, folderId: editor.folderId }}
							folders={data.folders}
							onClose={() => setEditor(null)}
							onMoved={close}
						/>
					) : null}
				</>
			) : draft && data ? (
				<ReceptionDraftDetail draft={draft} folders={data.folders} onReviewed={close} inPane />
			) : (
				<EmptyState icon={<File size={24} />} title={t("members.social.library.missing")} />
			)}
		</div>
	);
}

export function ReceptionDocumentDetail({
	document,
	onEdit,
	onRemoved,
}: {
	document: SocialLibrary["documents"][number];
	onEdit: () => void;
	onRemoved: () => void;
}) {
	const { t } = useTranslation();
	const date = useReceptionDate();
	const { setVisibility } = useMemoryFileActions();
	const path = document.path;
	return (
		<article className="flex min-w-0 flex-col gap-[var(--spacing-5)]">
			<header className="flex flex-col gap-[var(--spacing-2)]">
				<div className="flex items-start gap-[var(--spacing-2)]">
					<h2 className="min-w-0 flex-1 text-h2 font-semibold text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
						{document.title}
					</h2>
					{path ? <MemoryFileLink path={path} /> : null}
				</div>
				<div className="flex flex-wrap items-center gap-[var(--spacing-2)] text-caption text-[var(--color-text-tertiary)]">
					<span className="rounded-[var(--radius-control-sm)] bg-[var(--color-accent-subtle)] px-[var(--spacing-2)] py-[var(--spacing-1)] text-[var(--color-accent-text)]">
						{t("members.social.library.published")}
					</span>
					<time dateTime={document.updatedAt}>{date.format(new Date(document.updatedAt))}</time>
				</div>
			</header>
			<MessageContent body={document.content} />
			<SidePageActions className="flex flex-wrap items-center gap-[var(--spacing-2)]">
				{receptionWritablePath(path) ? (
					<>
						<Button size="sm" onClick={onEdit}>
							<Pencil size={16} aria-hidden />
							{t("members.social.library.editDocument")}
						</Button>
						<ReceptionRemoveButton id={document.id} title={document.title} onRemoved={onRemoved} />
					</>
				) : null}
				{path ? (
					<Button
						size="sm"
						variant="ghost"
						loading={setVisibility.isPending}
						onClick={() => setVisibility.mutate({ path, visibility: "private" }, { onSuccess: onRemoved })}
					>
						<EyeOff size={16} aria-hidden />
						{t("members.social.library.unpublish")}
					</Button>
				) : null}
			</SidePageActions>
			<ReceptionMutationError error={setVisibility.error} />
		</article>
	);
}

function MemoryFileLink({ path }: { path: string }) {
	const { t } = useTranslation();
	const side = useOptionalSidePanel();
	return side?.primaryResource === `memory:${path}` ? null : (
		<DetailLinkAction to={memoryFileRoute(path)} label={t("members.social.library.openMemory")} />
	);
}

export function ReceptionDraftDetail({
	draft,
	folders,
	onReviewed,
	inPane = false,
}: {
	draft: SocialLibrary["drafts"][number];
	folders: SocialLibrary["folders"];
	onReviewed: () => void;
	inPane?: boolean;
}) {
	const { t } = useTranslation();
	const date = useReceptionDate();
	const side = useOptionalSidePanel();
	const originalTitle = receptionDraftTitle(draft, t("members.social.library.untitledDraft"));
	const [title, setTitle] = useState(originalTitle);
	const [folderId, setFolderId] = useState<string | null>(draft.folderId ?? null);
	const { edit, busy } = useEditSocialLibrary();
	const canApprove = !busy && Boolean(title.trim());
	const setDirty = inPane ? side?.setDirty : undefined;
	useEffect(() => {
		setDirty?.(title !== originalTitle || folderId !== (draft.folderId ?? null));
		return () => setDirty?.(false);
	}, [draft.folderId, folderId, originalTitle, setDirty, title]);
	const reviewed = () => {
		setDirty?.(false);
		onReviewed();
	};

	async function approve() {
		try {
			await edit.mutateAsync({ kind: "review_draft", id: draft.id, approve: true, folderId, title: title.trim() });
			reviewed();
		} catch {
			// Keep the selected destination and title for retry.
		}
	}

	return (
		<article className="flex min-w-0 flex-col gap-[var(--spacing-5)]">
			<header className="flex flex-col gap-[var(--spacing-2)]">
				<div className="flex items-start gap-[var(--spacing-2)]">
					<h2 className="min-w-0 flex-1 text-h2 font-semibold text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
						{originalTitle}
					</h2>
					{draft.path ? <MemoryFileLink path={draft.path} /> : null}
				</div>
				<time className="text-caption text-[var(--color-text-tertiary)]" dateTime={draft.createdAt}>
					{date.format(new Date(draft.createdAt))}
				</time>
			</header>
			<MessageContent body={draft.content} />
			<form
				className="flex flex-col gap-[var(--spacing-4)] border-t border-[var(--color-border-subtle)] pt-[var(--spacing-4)]"
				onSubmit={(event) => {
					event.preventDefault();
					if (canApprove) void approve();
				}}
			>
				<TextField
					label={t("members.social.library.title")}
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					maxLength={120}
					disabled={busy}
					required
				/>
				<ReceptionFolderField folders={folders} value={folderId} onChange={setFolderId} disabled={busy} />
				<ReceptionMutationError error={edit.error} />
				<div className="flex flex-wrap gap-[var(--spacing-2)]">
					<Button type="submit" size="sm" variant="primary" disabled={!canApprove} loading={edit.isPending}>
						{t("members.social.approve")}
					</Button>
					<ReceptionRemoveButton draft id={draft.id} title={originalTitle} onRemoved={reviewed} />
				</div>
			</form>
		</article>
	);
}
