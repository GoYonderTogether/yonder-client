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

export function imageSize(width: number, height: number, edge = 2048) {
	const ratio = Math.min(1, edge / Math.max(width, height));
	return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

/** Preserve animation and vectors. Unknown PNG metadata before IDAT stays untouched as well. */
async function preserveImage(blob: Blob, name: string) {
	if (/gif|svg/i.test(blob.type) || /\.(?:gif|svg)$/i.test(name)) return true;
	const bytes = new Uint8Array(await blob.slice(0, 65_536).arrayBuffer());
	const ascii = (from: number, length: number) => String.fromCharCode(...bytes.subarray(from, from + length));
	if (ascii(0, 6).startsWith("GIF")) return true;
	if (ascii(4, 4) === "ftyp" && /avis|msf1/.test(ascii(8, Math.min(56, Math.max(0, bytes.length - 8))))) return true;
	if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return ascii(12, 4) === "VP8X" && Boolean((bytes[20] ?? 0) & 2);
	if (bytes[0] !== 137 || ascii(1, 3) !== "PNG") return false;
	const view = new DataView(bytes.buffer);
	for (let offset = 8; offset + 12 <= bytes.length; ) {
		const kind = ascii(offset + 4, 4);
		if (kind === "acTL") return true;
		if (kind === "IDAT" || kind === "IEND") return false;
		offset += view.getUint32(offset) + 12;
	}
	return true;
}

async function decode(blob: Blob): Promise<{ image: CanvasImageSource; width: number; height: number; close(): void }> {
	if (typeof createImageBitmap === "function") {
		try {
			const image = await createImageBitmap(blob, { imageOrientation: "from-image" });
			return { image, width: image.width, height: image.height, close: () => image.close() };
		} catch {
			/* WKWebView image decoding also supports formats absent from ImageBitmap. */
		}
	}
	const image = new Image();
	const url = URL.createObjectURL(blob);
	try {
		image.src = url;
		await image.decode();
		return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
	} catch (error) {
		URL.revokeObjectURL(url);
		throw error;
	}
}

export async function prepareImage(blob: Blob, name: string): Promise<PreparedImage | undefined> {
	if (!isImageFile(name, blob.type) || (await preserveImage(blob, name))) return;
	const display = await ensureDisplayBlob(blob, name);
	const decoded = await decode(display);
	try {
		const size = imageSize(decoded.width, decoded.height);
		const canvas = document.createElement("canvas");
		canvas.width = size.width;
		canvas.height = size.height;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("image_encoding_unavailable");
		context.drawImage(decoded.image, 0, 0, size.width, size.height);
		// WebP retains transparency; JPEG remains JPEG. Unsupported encoders fall back to PNG.
		const mime =
			/jpe?g|heic|heif/i.test(blob.type) || /\.(?:jpe?g|heic|heif)$/i.test(name) ? "image/jpeg" : "image/webp";
		const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.86));
		if (!encoded || encoded.size >= blob.size) return;
		const extension = encoded.type === "image/jpeg" ? "jpg" : encoded.type === "image/webp" ? "webp" : "png";
		return {
			blob: encoded,
			name: `${name.replace(/\.[^.]+$/, "")}.${extension}`,
			mimeType: encoded.type,
			...size,
			nonce: crypto.randomUUID(),
		};
	} finally {
		decoded.close();
	}
}
