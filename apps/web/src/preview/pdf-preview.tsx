import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { type PDFDocumentProxy, type PDFPageProxy, TextLayer } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import "pdfjs-dist/web/pdf_viewer.css";
import type { PreviewFile } from "./file-kind.ts";
import { getDocument } from "./pdf-loader.ts";
import { usePreviewTranslation } from "./preview-i18n.ts";

function PdfPage({
	document,
	number,
	width,
	root,
}: {
	document: PDFDocumentProxy;
	number: number;
	width: number;
	root: React.RefObject<HTMLDivElement | null>;
}) {
	const element = useRef<HTMLDivElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);
	const text = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);
	const [ratio, setRatio] = useState(Math.SQRT2);
	const [error, setError] = useState(false);
	const t = usePreviewTranslation();
	useEffect(() => {
		const observer = new IntersectionObserver((entries) => setVisible(entries.some((entry) => entry.isIntersecting)), {
			root: root.current,
			rootMargin: "800px 0px",
		});
		if (element.current) observer.observe(element.current);
		return () => observer.disconnect();
	}, [root]);
	useEffect(() => {
		if (!visible || !canvas.current || !text.current) return;
		let cancelled = false;
		let page: PDFPageProxy | undefined;
		let rendering: ReturnType<PDFPageProxy["render"]> | undefined;
		let layer: TextLayer | undefined;
		const drawing = canvas.current;
		const textContainer = text.current;
		setError(false);
		void document
			.getPage(number)
			.then(async (value) => {
				page = value;
				if (cancelled) return;
				const original = page.getViewport({ scale: 1 });
				const viewport = page.getViewport({ scale: width / original.width });
				setRatio(viewport.height / viewport.width);
				// Bound raster memory even when a high-DPI screen zooms into a large PDF page.
				const pixels = Math.min(devicePixelRatio || 1, 2, Math.sqrt(4_000_000 / (viewport.width * viewport.height)));
				drawing.width = Math.ceil(viewport.width * pixels);
				drawing.height = Math.ceil(viewport.height * pixels);
				rendering = page.render({
					canvas: drawing,
					viewport,
					transform: pixels === 1 ? undefined : [pixels, 0, 0, pixels, 0, 0],
				});
				textContainer.style.setProperty("--total-scale-factor", String(viewport.scale * viewport.userUnit));
				textContainer.style.setProperty("--scale-round-x", "1px");
				textContainer.style.setProperty("--scale-round-y", "1px");
				layer = new TextLayer({ textContentSource: page.streamTextContent(), container: textContainer, viewport });
				await Promise.all([rendering.promise, layer.render()]);
			})
			.catch(() => {
				if (!cancelled) setError(true);
			})
			.finally(() => {
				if (cancelled) page?.cleanup();
			});
		return () => {
			cancelled = true;
			rendering?.cancel();
			layer?.cancel();
			textContainer.replaceChildren();
			drawing.width = 1;
			drawing.height = 1;
			page?.cleanup();
		};
	}, [document, number, width, visible]);
	return (
		<div ref={element} className="attachment-pdf-page" data-pdf-page={number} style={{ width, height: width * ratio }}>
			{visible ? (
				<>
					<canvas ref={canvas} aria-label={`${t("page")} ${number}`} />
					<div ref={text} className="textLayer" />
				</>
			) : null}
			{error ? (
				<p role="status" className="attachment-reader-notice">
					{t("failed")}
				</p>
			) : null}
		</div>
	);
}

export default function PdfPreview({ file }: { file: PreviewFile }) {
	const t = usePreviewTranslation();
	const scroll = useRef<HTMLDivElement>(null);
	const [document, setDocument] = useState<PDFDocumentProxy>();
	const [error, setError] = useState<"failed" | "tooLarge">();
	const [width, setWidth] = useState(800);
	const [zoom, setZoom] = useState(1);
	const [page, setPage] = useState(1);
	useEffect(() => {
		let active = true;
		let loading: ReturnType<typeof getDocument> | undefined;
		setDocument(undefined);
		setError(undefined);
		setPage(1);
		void file.blob
			.arrayBuffer()
			.then(async (data) => {
				if (!active) return;
				loading = getDocument({ data: new Uint8Array(data), enableXfa: false });
				const pdf = await loading.promise;
				if (pdf.numPages > 2000) {
					setError("tooLarge");
					await loading.destroy();
					return;
				}
				if (active) setDocument(pdf);
			})
			.catch(() => {
				if (active) setError("failed");
			});
		return () => {
			active = false;
			void loading?.destroy();
		};
	}, [file.blob]);
	useEffect(() => {
		const element = scroll.current;
		if (!element) return;
		const resize = new ResizeObserver(() => setWidth(Math.max(240, Math.min(1000, element.clientWidth - 32))));
		resize.observe(element);
		return () => resize.disconnect();
	}, []);
	useEffect(() => {
		const element = scroll.current;
		if (!element || !document) return;
		const ratios = new Map<number, number>();
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries)
					ratios.set(Number((entry.target as HTMLElement).dataset.pdfPage), entry.intersectionRatio);
				const visible = [...ratios].filter(([, ratio]) => ratio > 0).sort((a, b) => b[1] - a[1]);
				if (visible[0]) setPage(visible[0][0]);
			},
			{ root: element, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
		);
		for (const page of element.querySelectorAll("[data-pdf-page]")) observer.observe(page);
		return () => observer.disconnect();
	}, [document]);
	function go(value: number) {
		const next = Math.max(1, Math.min(document?.numPages ?? 1, value));
		setPage(next);
		scroll.current?.querySelector(`[data-pdf-page="${next}"]`)?.scrollIntoView({ block: "start" });
	}
	return (
		<div className="attachment-pdf-reader">
			<div className="attachment-reader-toolbar">
				<button type="button" aria-label={t("previous")} onClick={() => go(page - 1)} disabled={page <= 1}>
					<ChevronLeft size={18} />
				</button>
				<input
					aria-label={t("page")}
					type="number"
					min={1}
					max={document?.numPages ?? 1}
					value={page}
					onChange={(event) => {
						if (event.target.value) go(Number(event.target.value));
					}}
				/>
				<span>{t("pages", { count: document?.numPages ?? 0 })}</span>
				<button
					type="button"
					aria-label={t("next")}
					onClick={() => go(page + 1)}
					disabled={!document || page >= document.numPages}
				>
					<ChevronRight size={18} />
				</button>
				<button type="button" aria-label={t("zoomOut")} onClick={() => setZoom((value) => Math.max(0.5, value / 1.25))}>
					<Minus size={18} />
				</button>
				<button type="button" aria-label={t("zoomIn")} onClick={() => setZoom((value) => Math.min(4, value * 1.25))}>
					<Plus size={18} />
				</button>
			</div>
			<div ref={scroll} className="attachment-pdf-scroll">
				{error ? (
					<p className="attachment-reader-notice" role="status">
						{t(error)}
					</p>
				) : !document ? (
					<p className="attachment-reader-notice" role="status">
						{t("loading")}
					</p>
				) : (
					Array.from({ length: document.numPages }, (_value, index) => index + 1).map((page) => (
						<PdfPage key={page} document={document} number={page} width={width * zoom} root={scroll} />
					))
				)}
			</div>
		</div>
	);
}
