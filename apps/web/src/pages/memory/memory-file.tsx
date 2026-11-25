import type { MemoryFileContent } from "@yonder/protocol";
import { Button, InlineError } from "@yonder/ui-components";
import { ApiError, useAccountTimeZone, useMemoryFile, useMemoryFileActions } from "@yonder/ui-data";
import { ArchiveRestore, ListChecks, MessageCircle, Mic, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { UserEditedBadge } from "./memory-edited.tsx";
import { MemoryEditor } from "./memory-editor.tsx";
import { useMinute } from "./memory-format.ts";
import { MemoryMarkdown } from "./memory-markdown.tsx";
import { useOpenMemoryFile, useSourceNavigation } from "./memory-navigation.ts";
import { MemoryError, MemoryLoading, useErrorText } from "./memory-status.tsx";
import { archivedOriginalPath, isAboutMemoryFile, isArchivedMemoryFile } from "./memory-view.ts";
import { VisibilityControl } from "./memory-visibility.tsx";
import { relativeTime, useAuthorName } from "./memory-who.ts";

const SOURCE_ICONS = { meeting: Mic, subtask: ListChecks, schedule: ListChecks } as const;
const SOURCE_LABELS: Record<string, string> = {
	chat: "memory.sourceChat",
	meeting: "memory.sourceMeeting",
	subtask: "memory.sourceTask",
	schedule: "memory.sourceSchedule",
};

/**
 * A file's own page (24 第五节): the title, who changed it and when, its visibility, the Markdown,
 * where it came from, and what the owner can do with it. The owner owns their data, so every live
 * file can be edited and deleted; `/me` files can only be emptied, not deleted (23 第九节).
 *
 * Meta Muse is the reference (2026-11-24): the owner edits the file directly, deletes it, or changes
 * who can see it. Version history and restore are gone from the app.
 *
 * An archived file (under `/archive/`, WAVE2 2026-11-25 §2) reads as it was: read-only, its content
 * and where it came from, because archiving is how content is put away rather than deleted. Its one
 * action is 恢复, which moves it back to the path it was archived from (no confirmation: the move is
 * itself reversible).
 */
export function MemoryFilePage({ path, onDeleted }: { path: string; onDeleted: () => void }) {
	const file = useMemoryFile(path);
	if (file.error)
		return (
			<div className="p-[var(--spacing-4)]">
				<MemoryError error={file.error} retry={() => void file.refetch()} />
			</div>
		);
	if (file.isPending) return <MemoryLoading />;
	return <FileBody key={`${file.data.path}:${file.data.version}`} file={file.data} onDeleted={onDeleted} />;
}

function FileBody({ file, onDeleted }: { file: MemoryFileContent; onDeleted: () => void }) {
	const { t, i18n } = useTranslation();
	const zone = useAccountTimeZone();
	const now = useMinute(zone);
	const author = useAuthorName();
	const openFile = useOpenMemoryFile();
	const actions = useMemoryFileActions();
	const [editing, setEditing] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const title = file.title || file.path.split("/").at(-1) || file.path;
	const archived = isArchivedMemoryFile(file.path);
	const originalPath = archivedOriginalPath(file.path);
	const deletable = !archived && !file.path.startsWith("/me/");
	const privateProfile = isAboutMemoryFile(file.path);
	const error = actions.setVisibility.error ?? actions.remove.error;
	const restoreError = actions.move.error;
	const errorText = useErrorText();
	const restoreMessage = (failure: Error) =>
		failure instanceof ApiError && failure.code === "conflict_version"
			? t("memory.restoreConflict")
			: errorText(failure);
	const restore = () => {
		if (!originalPath) return;
		actions.move.mutate({ from: file.path, to: originalPath }, { onSuccess: () => openFile(originalPath) });
	};
	return (
		<article className="flex flex-col gap-[var(--spacing-5)]">
			<header className="flex flex-col gap-[var(--spacing-2)]">
				<div className="flex items-start gap-[var(--spacing-2)]">
					<h2 className="min-w-0 flex-1 text-h2 [overflow-wrap:anywhere] text-[var(--color-text-primary)]">{title}</h2>
					{!archived && file.userEdited ? <UserEditedBadge path={file.path} /> : null}
				</div>
				<p className="text-caption text-[var(--color-text-tertiary)]">
					{t("memory.updatedByline", {
						who: author(file),
						when: relativeTime(file.updatedAt, now, i18n.resolvedLanguage ?? i18n.language, t("memory.justNow"), zone),
					})}
				</p>
				{privateProfile ? (
					<p className="text-caption text-[var(--color-text-tertiary)]">{t("memory.cardPrivate")}</p>
				) : archived ? null : (
					<VisibilityControl
						visibility={file.visibility}
						disabled={editing}
						busy={actions.setVisibility.isPending}
						onChange={(visibility) => actions.setVisibility.mutate({ path: file.path, visibility })}
					/>
				)}
			</header>
			{editing && !archived ? (
				<MemoryEditor file={file} onDone={() => setEditing(false)} />
			) : file.content.trim() ? (
				<MemoryMarkdown file={file} onOpen={openFile} />
			) : (
				<p className="text-body text-[var(--color-text-tertiary)]">{t("memory.noContent")}</p>
			)}
			{file.sources.length ? <FileSources file={file} /> : null}
			{archived ? (
				originalPath ? (
					<div className="flex flex-col items-start gap-[var(--spacing-2)]">
						<Button size="sm" loading={actions.move.isPending} onClick={restore}>
							<ArchiveRestore size={16} aria-hidden />
							{t("memory.restore")}
						</Button>
						{restoreError ? <InlineError>{restoreMessage(restoreError)}</InlineError> : null}
					</div>
				) : null
			) : file.draft && !privateProfile ? (
				<div className="flex gap-[var(--spacing-2)]">
					<Button
						variant="primary"
						loading={actions.setVisibility.isPending}
						onClick={() => actions.setVisibility.mutate({ path: file.path, visibility: "public" })}
					>
						{t("memory.makePublic")}
					</Button>
					<Button variant="danger" loading={actions.remove.isPending} onClick={() => setDeleting(true)}>
						{t("memory.deleteFile")}
					</Button>
				</div>
			) : (
				<div className="flex flex-wrap gap-[var(--spacing-2)]">
					<Button size="sm" onClick={() => setEditing(true)}>
						<Pencil size={16} aria-hidden />
						{t("memory.edit")}
					</Button>
					{deletable ? (
						<Button size="sm" variant="ghost" onClick={() => setDeleting(true)}>
							<Trash2 size={16} aria-hidden />
							{t("memory.deleteFile")}
						</Button>
					) : null}
				</div>
			)}
			{deleting ? (
				<div
					role="alertdialog"
					aria-label={t("memory.deleteFile")}
					className="flex flex-col gap-[var(--spacing-3)] rounded-[var(--radius-lg)] bg-[var(--color-danger-subtle)] p-[var(--spacing-4)]"
				>
					<p className="text-body text-[var(--color-text-primary)]">{t("memory.deleteFileQuestion")}</p>
					<div className="flex justify-end gap-[var(--spacing-2)]">
						<Button size="sm" disabled={actions.remove.isPending} onClick={() => setDeleting(false)}>
							{t("app.cancel")}
						</Button>
						<Button
							size="sm"
							variant="danger"
							loading={actions.remove.isPending}
							onClick={() => actions.remove.mutate(file.path, { onSuccess: onDeleted })}
						>
							{t("memory.deleteConfirm")}
						</Button>
					</div>
				</div>
			) : null}
			{error ? <MemoryError error={error} /> : null}
		</article>
	);
}

/** Where the file came from: a conversation, a meeting or an item, each opening what it names. */
function FileSources({ file }: { file: MemoryFileContent }) {
	const { t } = useTranslation();
	const navigate = useSourceNavigation();
	return (
		<section className="flex flex-col gap-[var(--spacing-2)]">
			<h3 className="text-caption font-medium text-[var(--color-text-tertiary)]">{t("memory.sources")}</h3>
			<ul className="flex flex-col gap-[var(--spacing-1)]">
				{file.sources.map((source) => {
					const Icon = SOURCE_ICONS[source.connector as keyof typeof SOURCE_ICONS] ?? MessageCircle;
					const label = source.title || t(SOURCE_LABELS[source.connector] ?? "memory.sourceChat");
					const open = navigate.file(source);
					const content = (
						<>
							<Icon size={16} aria-hidden className="shrink-0 text-[var(--color-text-tertiary)]" />
							<span className="min-w-0 truncate">{label}</span>
						</>
					);
					return (
						<li key={source.eventId}>
							{open ? (
								<button
									type="button"
									onClick={open}
									className="flex w-full items-center gap-[var(--spacing-2)] rounded-[var(--radius-control-sm)] px-[var(--spacing-2)] py-[var(--spacing-1)] text-start text-body text-[var(--color-accent-text)] hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
								>
									{content}
								</button>
							) : (
								<div className="flex items-center gap-[var(--spacing-2)] px-[var(--spacing-2)] py-[var(--spacing-1)] text-body text-[var(--color-text-secondary)]">
									{content}
								</div>
							)}
						</li>
					);
				})}
			</ul>
		</section>
	);
}
