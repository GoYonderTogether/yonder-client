import Taro from "@tarojs/taro";
import { t } from "./i18n";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

export interface ChosenImage {
	path: string;
	size?: number;
	type?: string;
}

// An unknown format, an animated file, or a PNG whose header is inconclusive is left untouched.
function canResize(header: ArrayBuffer) {
	const bytes = new Uint8Array(header);
	const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
	if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
		const chunk = ascii(12, 16);
		return chunk === "VP8 " || chunk === "VP8L" || (chunk === "VP8X" && bytes.length >= 21 && !(bytes[20] & 2));
	}
	if (bytes[0] !== 137 || ascii(1, 4) !== "PNG") return false;
	const view = new DataView(header);
	for (let offset = 8; offset + 12 <= bytes.length; ) {
		const kind = ascii(offset + 4, offset + 8);
		if (kind === "acTL") return false;
		if (kind === "IDAT") return true;
		offset += view.getUint32(offset) + 12;
	}
	return false;
}

/** Leave within-limit originals untouched and use only a verified smaller local file. */
export async function fitLocalImage(file: ChosenImage, cap: number, edge: number): Promise<ChosenImage> {
	if (process.env.TARO_ENV === "h5" || (file.size !== undefined && file.size <= cap)) return file;
	let original = file;
	try {
		const fs = Taro.getFileSystemManager();
		const size: number = file.size ?? fs.statSync(file.path).size;
		if (!Number.isSafeInteger(size) || size < 0) return file;
		original = { ...file, size };
		if (size <= cap) return original;
		const header = fs.readFileSync(file.path, undefined, 0, 65_536);
		if (!(header instanceof ArrayBuffer) || !canResize(header)) return original;
		const { width, height } = await Taro.getImageInfo({ src: file.path });
		const target = Math.min(edge, Math.max(width, height));
		if (!(target > 0)) return original;
		const { tempFilePath } = await Taro.compressImage({
			src: file.path,
			quality: 75,
			...(width >= height ? { compressedWidth: target } : { compressedHeight: target }),
		});
		const fittedSize: number = fs.statSync(tempFilePath).size;
		if (Number.isSafeInteger(fittedSize) && fittedSize > 0 && fittedSize <= cap) {
			return { path: tempFilePath, size: fittedSize };
		}
		return original;
	} catch {
		// No supported encoder or readable result; the caller keeps its normal upload limit.
		return original;
	}
}

export async function readAvatar(file: ChosenImage): Promise<{ bytes: ArrayBuffer; contentType: string }> {
	const exceedsLimit = () => new Error(t("头像不能超过 2 MB", "An avatar cannot be larger than 2 MB"));
	const selected = await fitLocalImage(file, AVATAR_MAX_BYTES, 1280);
	if (selected.size !== undefined && selected.size > AVATAR_MAX_BYTES) throw exceedsLimit();
	let bytes: ArrayBuffer;
	let contentType: string;
	if (process.env.TARO_ENV === "h5") {
		const blob = await (await fetch(selected.path)).blob();
		if (blob.size > AVATAR_MAX_BYTES) throw exceedsLimit();
		bytes = await blob.arrayBuffer();
		contentType = blob.type;
	} else {
		bytes = Taro.getFileSystemManager().readFileSync(selected.path) as ArrayBuffer;
		const format = (await Taro.getImageInfo({ src: selected.path })).type.trim().toLowerCase();
		contentType = !format || format.includes("/") ? format : `image/${format === "jpg" ? "jpeg" : format}`;
	}
	if (bytes.byteLength === 0) throw new Error(t("这个图片是空的", "That image is empty"));
	if (bytes.byteLength > AVATAR_MAX_BYTES) throw exceedsLimit();
	if (!AVATAR_TYPES.includes(contentType)) {
		throw new Error(
			t(
				`头像只能是 PNG、JPEG 或 WebP，这个是 ${contentType || "未知类型"}`,
				`An avatar must be PNG, JPEG or WebP, not ${contentType || "this file"}`,
			),
		);
	}
	return { bytes, contentType };
}
