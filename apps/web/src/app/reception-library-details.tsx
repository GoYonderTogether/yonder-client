import type { SocialLibrary } from "@yonder/protocol";
import { Button, TextField } from "@yonder/ui-components";
import { useEditSocialLibrary, useMemoryFileActions } from "@yonder/ui-data";
import { EyeOff, Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { memoryFileRoute } from "../pages/memory/memory-view.ts";
import { MessageContent } from "../pages/message-content.tsx";
import { receptionDraftTitle, useReceptionDate } from "./reception-library-directory.tsx";
import { ReceptionFolderField, ReceptionMutationError, ReceptionRemoveButton } from "./reception-library-editor.tsx";
import { receptionWritablePath } from "./reception-library-paths.ts";

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
				<h2 className="text-h2 font-semibold text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
					{document.title}
				</h2>
				<div className="flex flex-wrap items-center gap-[var(--spacing-2)] text-caption text-[var(--color-text-tertiary)]">
					<span className="rounded-[var(--radius-control-sm)] bg-[var(--color-accent-subtle)] px-[var(--spacing-2)] py-[var(--spacing-1)] text-[var(--color-accent-text)]">
						{t("members.social.library.published")}
					</span>
					<time dateTime={document.updatedAt}>{date(document.updatedAt)}</time>
				</div>
			</header>
			<MessageContent body={document.content} />
			<div className="flex flex-wrap items-center gap-[var(--spacing-2)]">
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
					<>
						<Button
							size="sm"
							variant="ghost"
							loading={setVisibility.isPending}
							onClick={() => setVisibility.mutate({ path, visibility: "private" }, { onSuccess: onRemoved })}
						>
							<EyeOff size={16} aria-hidden />
							{t("members.social.library.unpublish")}
						</Button>
						<MemoryFileLink path={path} />
					</>
				) : null}
			</div>
			<ReceptionMutationError error={setVisibility.error} />
		</article>
	);
}

function MemoryFileLink({ path }: { path: string }) {
	const { t } = useTranslation();
	return (
		<Link
			to={memoryFileRoute(path)}
			className="inline-flex min-h-[var(--control-sm)] items-center rounded-[var(--radius-control-sm)] px-[var(--spacing-2)] text-caption font-medium text-[var(--color-accent-text)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
		>
			{t("members.social.library.openMemory")}
		</Link>
	);
}

export function ReceptionDraftDetail({
	draft,
	folders,
	onReviewed,
}: {
	draft: SocialLibrary["drafts"][number];
	folders: SocialLibrary["folders"];
	onReviewed: () => void;
}) {
	const { t } = useTranslation();
	const date = useReceptionDate();
	const originalTitle = receptionDraftTitle(draft, t("members.social.library.untitledDraft"));
	const [title, setTitle] = useState(originalTitle);
	const [folderId, setFolderId] = useState<string | null>(draft.folderId ?? null);
	const { edit, busy } = useEditSocialLibrary();
	const canApprove = !busy && Boolean(title.trim());

	async function approve() {
		try {
			await edit.mutateAsync({ kind: "review_draft", id: draft.id, approve: true, folderId, title: title.trim() });
			onReviewed();
		} catch {
			// Keep the selected destination and title for retry.
		}
	}

	return (
		<article className="flex min-w-0 flex-col gap-[var(--spacing-5)]">
			<header className="flex flex-col gap-[var(--spacing-2)]">
				<h2 className="text-h2 font-semibold text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
					{originalTitle}
				</h2>
				<time className="text-caption text-[var(--color-text-tertiary)]" dateTime={draft.createdAt}>
					{date(draft.createdAt)}
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
					<ReceptionRemoveButton draft id={draft.id} title={originalTitle} onRemoved={onReviewed} />
					{draft.path ? <MemoryFileLink path={draft.path} /> : null}
				</div>
			</form>
		</article>
	);
}
