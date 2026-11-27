import { GesturePanel } from "@yonder/ui-shell";
import { Download, X } from "lucide-react";
import { lazy, Suspense, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { type PreviewFile, previewKind } from "./file-kind.ts";
import { ImagePreview } from "./image-preview.tsx";
import { MediaPreview } from "./media-preview.tsx";
import { PreviewBoundary } from "./preview-boundary.tsx";
import { usePreviewTranslation } from "./preview-i18n.ts";
import { TextPreview } from "./text-preview.tsx";
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

/** One reader for drafts and sent messages; bytes are already authorized, never a public file URL. */
export function AttachmentPreview({
	file,
	onClose,
	imageNavigation,
}: {
	file: PreviewFile;
	onClose: () => void;
	imageNavigation?: { position: number; total: number; move: (direction: -1 | 1) => void } | undefined;
}) {
	const t = usePreviewTranslation();
	usePreviewHistory(onClose);
	const layer = useRef<HTMLDivElement>(null);
	const moveImage = imageNavigation?.move;
	useEffect(() => {
		const element = layer.current;
		if (!element || !moveImage) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
			event.preventDefault();
			event.stopPropagation();
			moveImage(event.key === "ArrowLeft" ? -1 : 1);
		};
		element.addEventListener("keydown", onKeyDown);
		return () => element.removeEventListener("keydown", onKeyDown);
	}, [moveImage]);
	const kind = previewKind(file);
	let viewer: React.ReactNode;
	if (kind === "image") viewer = <ImagePreview file={file} onClose={onClose} onSwipe={imageNavigation?.move} />;
	else if (kind === "pdf") viewer = <PdfPreview file={file} />;
	else if (kind === "docx") viewer = <DocxPreview file={file} />;
	else if (kind === "text" || kind === "markdown" || kind === "doc") viewer = <TextPreview file={file} kind={kind} />;
	else if (kind === "audio" || kind === "video") viewer = <MediaPreview file={file} kind={kind} />;
	else viewer = <p className="attachment-reader-notice">{t("unsupported")}</p>;
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
					{imageNavigation ? (
						<output className="attachment-reader-position">
							{t("imagePosition", { position: imageNavigation.position, total: imageNavigation.total })}
						</output>
					) : null}
					<button
						type="button"
						onClick={() => downloadAttachment(file)}
						aria-label={t("download")}
						title={t("download")}
					>
						<Download size={20} aria-hidden="true" />
					</button>
					<button type="button" onClick={onClose} aria-label={t("close")} title={t("close")}>
						<X size={22} aria-hidden="true" />
					</button>
				</header>
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
			</GesturePanel>
		</div>,
		document.body,
	);
}
