export function imageSize(width: number, height: number, edge = 2048) {
	const ratio = Math.min(1, edge / Math.max(width, height));
	return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

/** Preserve animation and vectors. Unknown PNG metadata before IDAT stays untouched as well. */
export async function preserveImage(blob: Blob, name: string) {
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

/** Largest blob we pass to the browser's raster decoder on the upload path. */
export const IMAGE_PREPARE_MAX_BYTES = 64 * 1024 * 1024;

export async function encodeSmallerImage(
	blob: Blob,
	mime: string,
	edge: number,
	maxBytes: number,
	originalSize = blob.size,
) {
	const decoded = await decode(blob);
	try {
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		if (!context) throw new Error("image_encoding_unavailable");
		for (const [scale, quality] of [
			[1, 0.86],
			[0.7, 0.72],
			[0.5, 0.62],
		] as const) {
			const size = imageSize(decoded.width, decoded.height, edge * scale);
			canvas.width = size.width;
			canvas.height = size.height;
			context.drawImage(decoded.image, 0, 0, size.width, size.height);
			const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
			if (
				encoded &&
				encoded.size > 0 &&
				encoded.size <= maxBytes &&
				encoded.size < originalSize &&
				/^(image\/jpeg|image\/webp|image\/png)$/.test(encoded.type)
			)
				return { blob: encoded, ...size };
			if (originalSize <= maxBytes) break; // For an already uploadable image, do not repeatedly sacrifice quality.
		}
	} finally {
		decoded.close();
	}
}

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export class AvatarImageTooLargeError extends Error {}

export async function prepareAvatarImage(blob: Blob) {
	if (blob.size <= AVATAR_MAX_BYTES) return blob;
	const supported = /^(image\/jpeg|image\/png|image\/webp)$/.test(blob.type);
	if (supported && blob.size <= IMAGE_PREPARE_MAX_BYTES && !(await preserveImage(blob, ""))) {
		const mime = blob.type === "image/jpeg" ? blob.type : "image/webp";
		try {
			const result = await encodeSmallerImage(blob, mime, 1024, AVATAR_MAX_BYTES);
			if (result) return result.blob;
		} catch {
			// A decode/encoding failure must never fall back to sending oversized bytes.
		}
	}
	throw new AvatarImageTooLargeError();
}
