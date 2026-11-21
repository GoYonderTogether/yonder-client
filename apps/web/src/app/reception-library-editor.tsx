import { memberFailureText } from "@yonder/feature-members";
import type { SocialLibrary, SocialLibraryChange } from "@yonder/protocol";
import { Button, Field, SelectField, TextArea, TextField } from "@yonder/ui-components";
import { ApiError, useEditSocialLibrary } from "@yonder/ui-data";
import { ConfirmDialog, Overlay, useShellChrome } from "@yonder/ui-shell";
import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

type Folder = SocialLibrary["folders"][number];
type Document = SocialLibrary["documents"][number];

export type Editor = { folder: Folder | null } | { document: Document | null; folderId: string | null };

export function ReceptionLibraryEditor({
	initial,
	folders,
	onClose,
	onMoved,
}: {
	initial: Editor;
	folders: readonly Folder[];
	onClose: () => void;
	onMoved: () => void;
}) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const { edit, busy } = useEditSocialLibrary();
	const formId = useId();
	const contentId = useId();
	const isFolder = "folder" in initial;
	const item = isFolder ? initial.folder : initial.document;
	const originalName = isFolder ? initial.folder?.name : initial.document?.title;
	const originalContent = isFolder ? undefined : initial.document?.content;
	const originalFolderId = isFolder ? null : initial.folderId;
	const [name, setName] = useState(originalName ?? "");
	const [content, setContent] = useState(originalContent ?? "");
	const [folderId, setFolderId] = useState(originalFolderId);
	const changed =
		name.trim() !== originalName ||
		(!isFolder && (content.trim() !== originalContent || folderId !== originalFolderId));
	const canSave = changed && !busy && Boolean(name.trim()) && (isFolder || Boolean(content.trim()));
	const id = item ? { id: item.id } : {};
	const title = isFolder
		? t(item ? "members.social.library.renameFolder" : "members.social.library.newFolder")
		: t(item ? "members.social.library.editDocument" : "members.social.library.newDocument");
	const close = () => {
		if (!edit.isPending) onClose();
	};

	async function save() {
		const change: SocialLibraryChange = isFolder
			? { kind: "save_folder", ...id, name: name.trim() }
			: { kind: "save_document", ...id, folderId, title: name.trim(), content: content.trim() };
		try {
			await edit.mutateAsync(change);
			onClose();
			if (item && folderId !== originalFolderId) onMoved();
		} catch {
			// The mutation keeps its error and the editor stays open with the entered text.
		}
	}

	return (
		<Overlay
			open
			title={title}
			mode={mode}
			size={isFolder ? "small" : "wide"}
			mobilePresentation={isFolder ? "sheet" : "page"}
			closeLabel={t("app.close")}
			onClose={close}
			footer={
				<>
					<Button onClick={close} disabled={edit.isPending}>
						{t("app.cancel")}
					</Button>
					<Button type="submit" form={formId} variant="primary" disabled={!canSave} loading={edit.isPending}>
						{t(!isFolder && !item ? "members.social.library.saveAndPublish" : "app.save")}
					</Button>
				</>
			}
		>
			<form
				id={formId}
				className="flex flex-col gap-[var(--spacing-5)] p-[var(--spacing-5)]"
				onSubmit={(event) => {
					event.preventDefault();
					if (canSave) void save();
				}}
			>
				<TextField
					label={t(isFolder ? "members.social.library.folderName" : "members.social.library.title")}
					value={name}
					onChange={(event) => setName(event.target.value)}
					maxLength={120}
					disabled={edit.isPending}
					required
				/>
				{isFolder ? null : (
					<>
						<ReceptionFolderField folders={folders} value={folderId} onChange={setFolderId} disabled={edit.isPending} />
						<Field label={t("members.social.library.content")} htmlFor={contentId}>
							<TextArea
								id={contentId}
								value={content}
								onChange={(event) => setContent(event.target.value)}
								maxLength={20000}
								rows={8}
								disabled={edit.isPending}
								aria-describedby={undefined}
								required
							/>
						</Field>
					</>
				)}
				<ReceptionMutationError error={edit.error} />
			</form>
		</Overlay>
	);
}

export function ReceptionFolderField({
	folders,
	value,
	onChange,
	disabled,
}: {
	folders: readonly Folder[];
	value: string | null;
	onChange: (folderId: string | null) => void;
	disabled: boolean;
}) {
	const { t } = useTranslation();
	return (
		<SelectField
			label={t("members.social.library.folder")}
			value={value ?? ""}
			options={[
				{ value: "", label: t("members.social.library.root") },
				...folders.map((folder) => ({ value: folder.id, label: folder.name })),
			]}
			onChange={(id) => onChange(id || null)}
			disabled={disabled}
		/>
	);
}

export function ReceptionMutationError({ error }: { error: unknown }) {
	const { t } = useTranslation();
	return error ? (
		<p role="alert" className="text-caption text-[var(--color-danger)]">
			{error instanceof ApiError && error.code === "social_library_too_long"
				? t("members.social.library.tooLong")
				: memberFailureText(error, t)}
		</p>
	) : null;
}

export function ReceptionRemoveButton({
	draft,
	id,
	title,
	onRemoved,
}: {
	draft?: boolean;
	id: string;
	title: string;
	onRemoved: () => void;
}) {
	const { t } = useTranslation();
	const { edit, busy } = useEditSocialLibrary();
	const [confirm, setConfirm] = useState(false);
	const label = t(draft ? "members.social.discard" : "members.social.library.deleteDocument");
	const close = () => {
		if (!edit.isPending) setConfirm(false);
	};

	async function remove() {
		try {
			await edit.mutateAsync(draft ? { kind: "review_draft", id, approve: false } : { kind: "remove_document", id });
			setConfirm(false);
			onRemoved();
		} catch {
			// Keep confirmation open for the error and retry.
		}
	}

	return (
		<>
			<Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm(true)}>
				<Trash2 size={16} aria-hidden />
				{label}
			</Button>
			<ConfirmDialog
				open={confirm}
				title={label}
				body={t(draft ? "members.social.library.discardQuestion" : "members.social.library.deleteQuestion", { title })}
				confirmLabel={label}
				cancelLabel={t("app.cancel")}
				closeLabel={t("app.close")}
				backLabel={t("app.back")}
				busy={edit.isPending}
				error={memberFailureText(edit.error, t) || null}
				onCancel={close}
				onConfirm={() => void remove()}
			/>
		</>
	);
}
