import { AttachmentTile, MessageAttachmentsFrame } from "@yonder/chat-presentation";
import type { Attachment } from "@yonder/protocol";
import { CircleAlert, CloudDownload, Download, LoaderCircle, Play, RotateCcw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileTypeIcon } from "../lib/file-type-icon.tsx";
import { ensureDisplayBlob } from "../lib/image-display.ts";
import { useObjectUrl } from "../lib/use-object-url.ts";
import { useVideoPoster } from "../lib/use-video-poster.ts";
import { AttachmentPreview, downloadAttachment } from "../preview/attachment-preview.tsx";
import { type PreviewFile, previewKind } from "../preview/file-kind.ts";
import { usePreviewTranslation } from "../preview/preview-i18n.ts";
import { useAttachmentBlob } from "../preview/use-attachment-blob.ts";

export type AttachmentDownloadItem = {
	id: "download";
	label: string;
	icon: React.ReactNode;
	run: () => Promise<void>;
};

const downloadItems = new WeakMap<Element, AttachmentDownloadItem>();

export function getAttachmentDownloadItem(target: EventTarget | null): AttachmentDownloadItem | undefined {
	const tile = target instanceof Element ? target.closest("[data-attachment-id]") : null;
	return tile ? downloadItems.get(tile) : undefined;
}

type LoadAttachment = ReturnType<typeof useAttachmentBlob>["load"];

function MessageAttachment({
	attachment,
	loaders,
	onOpen,
}: {
	attachment: Attachment;
	loaders: Map<string, LoadAttachment>;
	onOpen: (attachment: Attachment) => void;
}) {
	const { t } = useTranslation();
	const labels = usePreviewTranslation();
	const original = useAttachmentBlob(attachment);
	const { load } = original;
	const downloadLabel = t("landingPage.nav.download");
	const card = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);
	const [display, setDisplay] = useState<Blob>();
	const kind = previewKind(attachment);
	const poster = useVideoPoster(kind === "video" ? original.blob : undefined);
	const url = useObjectUrl(kind === "video" ? poster : display);
	const media = !original.error && (kind === "image" || (kind === "video" && !!url));
	const extension = /\.([a-z0-9]{1,8})$/i.exec(attachment.name)?.[1]?.toUpperCase() ?? attachment.mimeType;

	useLayoutEffect(() => {
		const tile = card.current;
		if (!tile) return;
		loaders.set(attachment.id, load);
		downloadItems.set(tile, {
			id: "download",
			label: downloadLabel,
			icon: <Download size={16} aria-hidden="true" />,
			run: async () => {
				const blob = await load();
				if (blob) downloadAttachment({ ...attachment, blob });
			},
		});
		return () => {
			loaders.delete(attachment.id);
			downloadItems.delete(tile);
		};
	}, [attachment, downloadLabel, load, loaders]);
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
	return (
		<AttachmentTile as="div" elementRef={card} id={attachment.id}>
			<button
				type="button"
				className={`message-attachment-open ${media ? "message-attachment-media" : "message-attachment-file"}`}
				onClick={() => onOpen(attachment)}
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
		</AttachmentTile>
	);
}

export function MessageAttachments({ attachments, self = false }: { attachments: Attachment[]; self?: boolean }) {
	const loaders = useRef(new Map<string, LoadAttachment>());
	const request = useRef(0);
	const [selected, setSelected] = useState<PreviewFile>();
	const images = attachments.filter((attachment) => previewKind(attachment) === "image");
	const index = images.findIndex((image) => image.id === selected?.id);

	async function open(attachment: Attachment) {
		const current = ++request.current;
		const blob = await loaders.current.get(attachment.id)?.();
		if (blob && current === request.current) setSelected({ ...attachment, blob });
	}

	return attachments.length ? (
		<>
			<MessageAttachmentsFrame as="div" self={self}>
				{attachments.map((attachment) => (
					<MessageAttachment
						key={attachment.id}
						attachment={attachment}
						loaders={loaders.current}
						onOpen={(file) => void open(file)}
					/>
				))}
			</MessageAttachmentsFrame>
			{selected ? (
				<AttachmentPreview
					file={selected}
					imageNavigation={
						index >= 0 && images.length > 1
							? {
									position: index + 1,
									total: images.length,
									move: (direction) => {
										const next = images[index + direction];
										if (next) void open(next);
									},
								}
							: undefined
					}
					onClose={() => {
						request.current++;
						setSelected(undefined);
					}}
				/>
			) : null}
		</>
	) : null;
}
