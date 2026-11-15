export const isTextAttachment = (name: string, mime: string) =>
	mime.startsWith("text/") ||
	/\.(?:txt|md|markdown|csv|json|log|ya?ml|xml|html?|css|[cm]?jsx?|tsx?|py|sh)$/i.test(name);

export function decodeAttachmentText(bytes: Uint8Array, partial = false): string {
	if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes, { stream: partial });
	if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes, { stream: partial });
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: partial });
	} catch {
		return new TextDecoder("gb18030").decode(bytes, { stream: partial });
	}
}

/** A card is a small view of the beginning, not a second full document in the component tree. */
export async function readTextThumbnail(blob: Blob, partial = false): Promise<string> {
	const bytes = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
	return decodeAttachmentText(bytes, partial || blob.size > 4096)
		.replace(/^\uFEFF/, "")
		.replaceAll("\0", "")
		.slice(0, 600);
}
