import { UploadTile } from "@yonder/chat-presentation";
import { useApi } from "@yonder/ui-data";
import { LoaderCircle, Play, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileTypeIcon } from "../lib/file-type-icon.tsx";
import { ensureDisplayBlob } from "../lib/image-display.ts";
import { isImageFile } from "../lib/prepare-image.ts";
import { useObjectUrl } from "../lib/use-object-url.ts";
import { useVideoPoster } from "../lib/use-video-poster.ts";
import { AttachmentPreview } from "../preview/attachment-preview.tsx";
import { createDocumentThumbnail } from "../preview/document-thumbnail.ts";
import { previewKind } from "../preview/file-kind.ts";
import { CHAT_ATTACHMENT_MAX_BYTES, type DraftFile, selectedDraftFile } from "./use-chat-draft.ts";

function DraftFileTile({
	file,
	disabled,
	iphonePhotos,
	onRemove,
	onRetry,
	onOriginalChange,
	onPreview,
}: {
	file: DraftFile;
	disabled: boolean;
	iphonePhotos: boolean;
	onRemove: () => void;
	onRetry: () => void;
	onOriginalChange: (original: boolean) => void;
	onPreview: () => void;
}) {
	const { t } = useTranslation();
	const api = useApi();
	const selected = selectedDraftFile(file);
	const thumbnail = file.optimized ?? selected;
	const image = isImageFile(file.name, file.mimeType);
	const iphonePhoto = iphonePhotos && image;
	const [display, setDisplay] = useState<Blob>();
	const [text, setText] = useState("");
	const kind = previewKind(file);
	const video = kind === "video";
	const poster = useVideoPoster(video ? selected.blob : undefined);
	const url = useObjectUrl(video ? poster : display);
	useEffect(() => {
		let active = true;
		const controller = new AbortController();
		setDisplay(undefined);
		setText("");
		if (image && file.imagePrepared && !file.imageError)
			void ensureDisplayBlob(thumbnail.blob, thumbnail.name)
				.then((blob) => {
					if (active) setDisplay(blob);
				})
				.catch(() => {});
		else if (kind === "doc")
			void api
				.previewAttachmentText(new File([file.blob], file.name, { type: file.mimeType }), controller.signal)
				.then((result) => {
					if (active) setText(result.text.slice(0, 600));
				})
				.catch(() => {});
		else if (!video)
			void createDocumentThumbnail({ name: file.name, mimeType: file.mimeType, blob: file.blob }, controller.signal)
				.then((result) => {
					if (active) {
						setDisplay(result.blob);
						setText(result.text ?? "");
					}
				})
				.catch(() => {});
		return () => {
			active = false;
			controller.abort();
		};
	}, [
		api,
		kind,
		video,
		image,
		file.imagePrepared,
		file.imageError,
		file.name,
		file.mimeType,
		file.blob,
		thumbnail.blob,
		thumbnail.name,
	]);
	return (
		<UploadTile as="div" name={file.name} kind={kind}>
			<button
				type="button"
				className="composer-file-preview"
				data-iphone-photo={iphonePhoto || undefined}
				aria-label={t("composerAttachments.preview", { name: file.name })}
				onClick={onPreview}
			>
				{url ? (
					<img
						src={url}
						alt={file.name}
						className={`composer-file-image ${kind === "pdf" ? "composer-file-document-image" : ""}`}
					/>
				) : text ? (
					<pre className="composer-file-text" aria-hidden="true">
						{text}
					</pre>
				) : (
					<span className="composer-file-icon">
						<FileTypeIcon file={file} size={30} />
					</span>
				)}
				{video ? (
					<span className="attachment-video-play" aria-hidden="true">
						<Play size={20} fill="currentColor" />
					</span>
				) : null}
				{iphonePhoto ? null : (
					<span className="composer-file-name" title={file.name}>
						<FileTypeIcon file={file} size={14} />
						<span>{file.name}</span>
					</span>
				)}
			</button>
			{image && file.blob.size <= CHAT_ATTACHMENT_MAX_BYTES ? (
				<label className="composer-file-original" data-iphone-photo={iphonePhoto || undefined}>
					<input
						type="checkbox"
						checked={Boolean(file.sendOriginal)}
						disabled={disabled}
						onChange={(event) => onOriginalChange(event.target.checked)}
					/>
					{t(iphonePhoto ? "composerAttachments.sendOriginal" : "composerAttachments.original")}
					{iphonePhoto ? null : <span>{Math.ceil(selected.blob.size / 1024)} KB</span>}
				</label>
			) : null}
			{file.status === "preparing" || file.status === "uploading" ? (
				<span role="status" className={iphonePhoto && file.status === "preparing" ? "sr-only" : "composer-file-state"}>
					<LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
					{t(file.status === "preparing" ? "composerAttachments.preparing" : "chat.uploading")}
				</span>
			) : !iphonePhoto && file.optimized && !file.sendOriginal ? (
				<span className="composer-file-state text-[var(--color-text-tertiary)]">
					{t("composerAttachments.optimized")}
				</span>
			) : null}
			{file.imageError ? (
				<span className="composer-file-state text-[var(--color-danger)]">
					{t("composerAttachments.conversionFailed")}
				</span>
			) : null}
			{file.status === "failed" ? (
				<button
					type="button"
					className="composer-file-state text-[var(--color-danger)]"
					onClick={onRetry}
					disabled={disabled}
				>
					<RotateCcw size={14} aria-hidden="true" />
					{t("app.retry")}
				</button>
			) : null}
			<button
				type="button"
				className="composer-file-remove"
				aria-label={t("chat.removeFile", { name: file.name })}
				onClick={onRemove}
				disabled={disabled}
			>
				<X size={14} aria-hidden="true" />
			</button>
		</UploadTile>
	);
}

export function ComposerFiles({
	files,
	disabled,
	iphonePhotos,
	onRemove,
	onRetry,
	onOriginalChange,
}: {
	files: DraftFile[];
	disabled: boolean;
	iphonePhotos: boolean;
	onRemove: (id: string) => void;
	onRetry: (id: string) => void;
	onOriginalChange: (id: string, original: boolean) => void;
}) {
	const [previewId, setPreviewId] = useState<string | null>(null);
	const preview = files.find((file) => file.id === previewId);
	return (
		<>
			<div className="composer-files">
				{files.map((file) => (
					<DraftFileTile
						key={file.id}
						file={file}
						disabled={disabled}
						iphonePhotos={iphonePhotos}
						onRemove={() => onRemove(file.id)}
						onRetry={() => onRetry(file.id)}
						onOriginalChange={(original) => onOriginalChange(file.id, original)}
						onPreview={() => setPreviewId(file.id)}
					/>
				))}
			</div>
			{preview ? <AttachmentPreview file={selectedDraftFile(preview)} onClose={() => setPreviewId(null)} /> : null}
		</>
	);
}
