import type { Attachment } from "@yonder/protocol";
import { CircleAlert, CloudDownload, LoaderCircle, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileTypeIcon } from "../lib/file-type-icon.tsx";
import { ensureDisplayBlob } from "../lib/image-display.ts";
import { useObjectUrl } from "../lib/use-object-url.ts";
import { useVideoPoster } from "../lib/use-video-poster.ts";
import { AttachmentPreview } from "../preview/attachment-preview.tsx";
import { type PreviewFile, previewKind } from "../preview/file-kind.ts";
import { usePreviewTranslation } from "../preview/preview-i18n.ts";
import { useAttachmentBlob } from "../preview/use-attachment-blob.ts";

function MessageAttachment({ attachment }: { attachment: Attachment }) {
	const { t } = useTranslation();
	const labels = usePreviewTranslation();
	const original = useAttachmentBlob(attachment);
	const card = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);
	const [display, setDisplay] = useState<Blob>();
	const [selected, setSelected] = useState<PreviewFile>();
	const kind = previewKind(attachment);
	const poster = useVideoPoster(kind === "video" ? original.blob : undefined);
	const url = useObjectUrl(kind === "video" ? poster : display);
	const media = kind === "image" || (kind === "video" && !!url);
	const extension = /\.([a-z0-9]{1,8})$/i.exec(attachment.name)?.[1]?.toUpperCase() ?? attachment.mimeType;

	useEffect(() => {
		const observer = new IntersectionObserver((entries) => setVisible(entries.some((entry) => entry.isIntersecting)), {
			rootMargin: "300px",
		});
		if (card.current) observer.observe(card.current);
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		if (!visible) return;
		if (kind === "image") void original.load();
		// The sending flow may already have cached an original. Peeking never fetches or parses it.
		else void original.loadCached();
	}, [visible, kind, original.load, original.loadCached]);
	useEffect(() => {
		let active = true;
		setDisplay(undefined);
		if (original.blob && kind === "image")
			void ensureDisplayBlob(original.blob, attachment.name)
				.then((blob) => {
					if (active) setDisplay(blob);
				})
				.catch(() => {});
		return () => {
			active = false;
		};
	}, [original.blob, kind, attachment.name]);
	async function open() {
		const blob = await original.load();
		if (blob) setSelected({ ...attachment, blob });
	}
	return (
		<div ref={card} className="message-attachment" data-attachment-id={attachment.id}>
			<button
				type="button"
				className={`message-attachment-open ${media ? "message-attachment-media" : "message-attachment-file"}`}
				onClick={() => void open()}
				aria-label={labels("open", { name: attachment.name })}
				disabled={original.loading}
			>
				{media ? (
					<>
						{url ? (
							<img className="message-attachment-image" src={url} alt={attachment.name} />
						) : (
							<span className="message-attachment-image message-attachment-placeholder">
								<FileTypeIcon file={attachment} size={24} />
							</span>
						)}
						{kind === "video" ? (
							<span className="attachment-video-play" aria-hidden="true">
								<Play size={24} fill="currentColor" />
							</span>
						) : null}
						{original.loading ? (
							<span className="message-attachment-overlay">
								<LoaderCircle className="animate-spin" size={20} aria-label={t("app.loading")} />
							</span>
						) : null}
					</>
				) : (
					<>
						<span className="message-attachment-caption">
							<span className="message-attachment-name" title={attachment.name}>
								{attachment.name}
							</span>
							<small>
								{original.error
									? `${t("chat.attachmentFailed")} · ${t("app.retry")}`
									: `${extension} · ${Math.ceil(attachment.size / 1024)} KB`}
							</small>
						</span>
						<span
							className="message-attachment-icon"
							data-attachment-state={
								original.loading ? "loading" : original.error ? "failed" : original.blob ? "cached" : "remote"
							}
						>
							<FileTypeIcon file={attachment} size={32} />
							{original.loading || original.error || !original.blob ? (
								<span className="message-attachment-state-badge">
									{original.loading ? (
										<LoaderCircle size={12} className="animate-spin" aria-label={t("app.loading")} />
									) : original.error ? (
										<RotateCcw size={12} aria-label={t("app.retry")} />
									) : (
										<CloudDownload size={12} aria-hidden="true" />
									)}
								</span>
							) : null}
							{kind === "video" && !original.loading ? (
								<Play size={10} className="message-attachment-icon-play" fill="currentColor" aria-hidden="true" />
							) : null}
						</span>
					</>
				)}
				{original.cacheError ? (
					<span role="status" className="message-attachment-cache-error" title={t("chat.cacheFailed")}>
						<CircleAlert size={14} aria-label={t("chat.cacheFailed")} />
					</span>
				) : null}
			</button>
			{selected ? <AttachmentPreview file={selected} onClose={() => setSelected(undefined)} /> : null}
		</div>
	);
}

export function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
	return attachments.length ? (
		<div className="message-attachments">
			{attachments.map((attachment) => (
				<MessageAttachment key={attachment.id} attachment={attachment} />
			))}
		</div>
	) : null;
}
