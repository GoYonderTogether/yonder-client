import { GesturePanel, SidePageActions } from "@yonder/ui-shell";
import { Download, X } from "lucide-react";
import { lazy, Suspense } from "react";
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

function DownloadAttachment({ file }: { file: PreviewFile }) {
	const t = usePreviewTranslation();
	return (
		<button type="button" onClick={() => downloadAttachment(file)} aria-label={t("download")} title={t("download")}>
			<Download size={20} aria-hidden="true" />
		</button>
	);
}

/** The same authorized bytes can be opened in a detail tab or a draft's temporary overlay. */
export function AttachmentReader({
	file,
	onClose,
	display = "pane",
}: {
	file: PreviewFile;
	onClose?: (() => void) | undefined;
	display?: "pane" | "overlay";
}) {
	const t = usePreviewTranslation();
	const kind = previewKind(file);
	let viewer: React.ReactNode;
	if (kind === "image") viewer = <ImagePreview file={file} onClose={onClose} />;
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
		<section className="attachment-reader attachment-reader-pane" data-attachment-pane-reader>
			<SidePageActions className="attachment-reader-toolbar attachment-reader-download">
				<DownloadAttachment file={file} />
			</SidePageActions>
			{reader}
		</section>
	);
}

export function AttachmentPreview({ file, onClose }: { file: PreviewFile; onClose: () => void }) {
	const t = usePreviewTranslation();
	usePreviewHistory(onClose);
	return createPortal(
		<div className="attachment-preview-layer">
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
					<DownloadAttachment file={file} />
					<button type="button" onClick={onClose} aria-label={t("close")} title={t("close")}>
						<X size={22} aria-hidden="true" />
					</button>
				</header>
				<AttachmentReader file={file} onClose={onClose} display="overlay" />
			</GesturePanel>
		</div>,
		document.body,
	);
}
