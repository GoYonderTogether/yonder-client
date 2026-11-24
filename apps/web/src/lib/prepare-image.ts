import { encodeSmallerImage, IMAGE_PREPARE_MAX_BYTES, preserveImage } from "@yonder/ui-data";
import { ensureDisplayBlob } from "./image-display.ts";

export interface PreparedImage {
	blob: Blob;
	name: string;
	mimeType: string;
	width: number;
	height: number;
	/** A newly encoded byte sequence gets its own stable upload identity. */
	nonce: string;
}

export const isImageFile = (name: string, mime: string) =>
	mime.startsWith("image/") || /\.(?:jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?|svg)$/i.test(name);

export { imageSize } from "@yonder/ui-data";

export function canPrepareLargeImage(name: string, mime: string, size: number) {
	return (
		size <= IMAGE_PREPARE_MAX_BYTES &&
		(/^(image\/(?:jpeg|png|webp|heic|heif|avif))$/i.test(mime) ||
			(!mime && /\.(?:jpe?g|png|webp|heic|heif|avif)$/i.test(name)))
	);
}

export async function prepareImage(
	blob: Blob,
	name: string,
	maxBytes = Number.POSITIVE_INFINITY,
): Promise<PreparedImage | undefined> {
	if (blob.size > IMAGE_PREPARE_MAX_BYTES || !isImageFile(name, blob.type) || (await preserveImage(blob, name))) return;
	const display = await ensureDisplayBlob(blob, name);
	// WebP retains transparency; JPEG remains JPEG. Unsupported encoders fall back to PNG.
	const mime = /jpe?g|heic|heif/i.test(blob.type) || /\.(?:jpe?g|heic|heif)$/i.test(name) ? "image/jpeg" : "image/webp";
	const result = await encodeSmallerImage(display, mime, 2048, maxBytes, blob.size);
	if (!result) return;
	const extension = result.blob.type === "image/jpeg" ? "jpg" : result.blob.type === "image/webp" ? "webp" : "png";
	return {
		...result,
		name: `${name.replace(/\.[^.]+$/, "")}.${extension}`,
		mimeType: result.blob.type,
		nonce: crypto.randomUUID(),
	};
}
