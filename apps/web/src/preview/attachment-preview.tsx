import { IconButton } from "@yonder/ui-components";
import { GesturePanel, SidePageActions, useShellChrome } from "@yonder/ui-shell";
import { Download, X } from "lucide-react";
import { lazy, type RefObject, Suspense, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { type PreviewFile, previewKind } from "./file-kind.ts";
import { ImagePreview } from "./image-preview.tsx";
import { MediaPreview } from "./media-preview.tsx";
import { PreviewBoundary } from "./preview-boundary.tsx";
import { usePreviewTranslation } from "./preview-i18n.ts";
import { TextPreview } from "./text-preview.tsx";
import { useAttachmentImageRevoked } from "./use-image-blob.ts";
import { usePreviewHistory } from "./use-preview-history.ts";
import "./preview.css";

const PdfPreview = lazy(() => import("./pdf-preview.tsx"));
const DocxPreview = lazy(() => import("./docx-preview.tsx"));

export type { PreviewFile } from "./file-kind.ts";

export function downloadAttachment(file: PreviewFile) {
	const address = URL.createObjectURL(file.blob);
	const link = document.createElement("a");
	link.href = address;
	link.download = file.name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(address), 30_000);
}

export type ImageNavigation = {
	position: number;
	total: number;
	move: (direction: -1 | 1) => void;
};

function useImageKeys(container: RefObject<HTMLElement | null>, moveImage: ImageNavigation["move"] | undefined) {
	useEffect(() => {
		const element = container.current;
		if (!element || !moveImage) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
			event.preventDefault();
			event.stopPropagation();
			moveImage(event.key === "ArrowLeft" ? -1 : 1);
		};
		element.addEventListener("keydown", onKeyDown);
		return () => element.removeEventListener("keydown", onKeyDown);
	}, [container, moveImage]);
}

function ImagePosition({ position, total }: ImageNavigation) {
	const t = usePreviewTranslation();
	return <output className="attachment-reader-position">{t("imagePosition", { position, total })}</output>;
}

function DownloadAttachment({ file, compact = false }: { file: PreviewFile; compact?: boolean }) {
	const t = usePreviewTranslation();
	return (
		<IconButton
			size={compact ? "sm" : "md"}
			onClick={() => downloadAttachment(file)}
			aria-label={t("download")}
			title={t("download")}
		>
			<Download size={20} aria-hidden="true" />
		</IconButton>
	);
}

/** The same authorized bytes can be opened in a detail tab or a draft's temporary overlay. */
export function AttachmentReader({
	file,
	onClose,
	display = "pane",
	imageNavigation,
}: {
	file: PreviewFile;
	onClose?: (() => void) | undefined;
	display?: "pane" | "overlay";
	imageNavigation?: ImageNavigation | undefined;
}) {
	const t = usePreviewTranslation();
	const { desktop } = useShellChrome();
	const pane = useRef<HTMLElement>(null);
	useImageKeys(pane, imageNavigation?.move);
	const kind = previewKind(file);
	const revoked = useAttachmentImageRevoked(kind === "image" ? file.id : undefined);
	if (revoked)
		return (
			<p role="status" className="attachment-reader-notice">
				{t("failed")}
			</p>
		);
	let viewer: React.ReactNode;
	if (kind === "image") viewer = <ImagePreview file={file} onClose={onClose} onSwipe={imageNavigation?.move} />;
	else if (kind === "pdf") viewer = <PdfPreview file={file} />;
	else if (kind === "docx") viewer = <DocxPreview file={file} />;
	else if (kind === "text" || kind === "markdown" || kind === "doc") viewer = <TextPreview file={file} kind={kind} />;
	else if (kind === "audio" || kind === "video")
		viewer = <MediaPreview key={kind} file={file} kind={kind} pauseWhenHidden={display === "pane"} />;
	else viewer = <p className="attachment-reader-notice">{t("unsupported")}</p>;
	const reader = (
		<PreviewBoundary
			fallback={
				<p role="status" className="attachment-reader-notice">
					{t("failed")}
				</p>
			}
		>
			<Suspense
				fallback={
					<p role="status" className="attachment-reader-notice">
						{t("loading")}
					</p>
				}
			>
				{viewer}
			</Suspense>
		</PreviewBoundary>
	);
	if (display === "overlay") return reader;
	return (
		<section
			ref={pane}
			className="attachment-reader attachment-reader-pane"
			data-attachment-pane-reader
			data-inline-actions={desktop ? undefined : imageNavigation ? "gallery" : "file"}
		>
			<SidePageActions placement="title">
				<div className={desktop ? "flex items-center gap-[var(--spacing-1)]" : "attachment-reader-inline-actions"}>
					{imageNavigation ? <ImagePosition {...imageNavigation} /> : null}
					<DownloadAttachment file={file} compact />
				</div>
			</SidePageActions>
			{reader}
		</section>
	);
}

export function AttachmentPreview({
	file,
	onClose,
	imageNavigation,
}: {
	file: PreviewFile;
	onClose: () => void;
	imageNavigation?: ImageNavigation | undefined;
}) {
	const t = usePreviewTranslation();
	usePreviewHistory(onClose);
	const layer = useRef<HTMLDivElement>(null);
	useImageKeys(layer, imageNavigation?.move);
	const revoked = useAttachmentImageRevoked(previewKind(file) === "image" ? file.id : undefined);
	useEffect(() => {
		if (revoked) onClose();
	}, [revoked, onClose]);
	if (revoked) return null;
	return createPortal(
		<div ref={layer} className="attachment-preview-layer">
			<GesturePanel
				open
				initial={false}
				layerKey="attachment-preview"
				modal
				priority={40}
				label={t("preview", { name: file.name })}
				onBack={onClose}
				className="attachment-reader"
			>
				<header className="attachment-reader-header">
					<h2 title={file.name}>{file.name}</h2>
					{imageNavigation ? <ImagePosition {...imageNavigation} /> : null}
					<DownloadAttachment file={file} />
					<button type="button" onClick={onClose} aria-label={t("close")} title={t("close")}>
						<X size={22} aria-hidden="true" />
					</button>
				</header>
				<AttachmentReader file={file} onClose={onClose} display="overlay" imageNavigation={imageNavigation} />
			</GesturePanel>
		</div>,
		document.body,
	);
}
