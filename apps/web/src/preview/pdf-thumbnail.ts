import type { RenderTask } from "pdfjs-dist";
import { getDocument } from "./pdf-loader.ts";

/** Draft-only first-page raster; the full reader keeps its own document lifecycle. */
export async function createPdfThumbnail(blob: Blob, signal: AbortSignal): Promise<Blob> {
	const data = await blob.arrayBuffer();
	if (signal.aborted) throw new DOMException("Aborted", "AbortError");
	const loading = getDocument({ data: new Uint8Array(data), enableXfa: false });
	let rendering: RenderTask | undefined;
	const cancel = () => {
		rendering?.cancel();
		void loading.destroy();
	};
	signal.addEventListener("abort", cancel, { once: true });
	const canvas = document.createElement("canvas");
	try {
		const pdf = await loading.promise;
		const page = await pdf.getPage(1);
		const original = page.getViewport({ scale: 1 });
		const viewport = page.getViewport({ scale: Math.min(1, 320 / Math.max(original.width, original.height)) });
		canvas.width = Math.ceil(viewport.width);
		canvas.height = Math.ceil(viewport.height);
		rendering = page.render({ canvas, viewport });
		await rendering.promise;
		if (signal.aborted) throw new DOMException("Aborted", "AbortError");
		return await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(value) => (value ? resolve(value) : reject(new Error("pdf_thumbnail_failed"))),
				"image/jpeg",
				0.75,
			),
		);
	} finally {
		signal.removeEventListener("abort", cancel);
		canvas.width = canvas.height = 1;
		await loading.destroy();
	}
}
