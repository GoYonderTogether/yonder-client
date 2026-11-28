import { readTextThumbnail } from "../lib/attachment-text.ts";
import { validateDocxSize } from "./docx-size.ts";
import { type PreviewFile, previewKind } from "./file-kind.ts";
import { readLegacyWord } from "./legacy-word.ts";

export async function createDocumentThumbnail(
	file: PreviewFile,
	signal: AbortSignal,
): Promise<{ text?: string; blob?: Blob }> {
	const kind = previewKind(file);
	if (kind === "text" || kind === "markdown") return { text: await readTextThumbnail(file.blob) };
	if (kind === "doc") return { text: (await readLegacyWord(file.blob, signal)).text.slice(0, 600) };
	if (kind === "pdf") {
		const { createPdfThumbnail } = await import("./pdf-thumbnail.ts");
		if (signal.aborted) return {};
		return { blob: await createPdfThumbnail(file.blob, signal) };
	}
	if (kind === "docx") {
		const data = await file.blob.arrayBuffer();
		validateDocxSize(data);
		if (signal.aborted) return {};
		const { extractRawText } = await import("mammoth");
		const result = await extractRawText({ arrayBuffer: data });
		return { text: result.value.slice(0, 600) };
	}
	return {};
}
