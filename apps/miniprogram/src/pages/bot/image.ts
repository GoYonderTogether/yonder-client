/**
 * A Bot's avatar upload. `api.uploadBotAvatar(id, Blob)` cannot be used here: the mini program
 * has no `Blob` in the WeChat host, and its transport carries bytes (an `ArrayBuffer`) or a
 * temporary file path rather than a browser file. The person's avatar already goes through
 * `client.request(..., { raw })` for the same reason, so this mirrors that path exactly: the same
 * 2 MB and PNG/JPEG/WebP limits, the same content type derivation, and the server sniffs the
 * magic bytes either way.
 */
import Taro from "@tarojs/taro";
import type { Member } from "@yonder/protocol";
import { t } from "../../lib/i18n";
import { client } from "../../lib/runtime";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** A file Taro's picker returned: weapp gives a path and size, H5 also the MIME type. */
export interface ChosenImage {
	path: string;
	size?: number;
	type?: string;
}

function rejectedType(value: string): string {
	return t(
		`头像只能是 PNG、JPEG 或 WebP，这个是 ${value || "未知类型"}`,
		`An avatar must be PNG, JPEG or WebP, not ${value || "this file"}`,
	);
}

/**
 * WeChat reports a bare format (`png`, `jpg`, `webp`); H5 reports the MIME type of the picked
 * file. Either becomes the declared type, and an unrecognised one keeps its name so the refusal
 * can say what it was.
 */
function toContentType(type: string): string {
	const value = type.trim().toLowerCase();
	if (!value) return "";
	if (value.includes("/")) return value;
	return `image/${value === "jpg" ? "jpeg" : value}`;
}

/**
 * The bytes and declared type, or a throw with a sentence that names what is wrong. The size is
 * checked before the file is read, so a large photo is not loaded into memory to be refused.
 */
export async function readAvatar(file: ChosenImage): Promise<{ bytes: ArrayBuffer; contentType: string }> {
	if (file.size !== undefined && file.size > AVATAR_MAX_BYTES)
		throw new Error(t("头像不能超过 2 MB", "An avatar cannot be larger than 2 MB"));
	let bytes: ArrayBuffer;
	let contentType = "";
	if (process.env.TARO_ENV === "h5") {
		const blob = await (await fetch(file.path)).blob();
		bytes = await blob.arrayBuffer();
		contentType = blob.type;
	} else {
		bytes = Taro.getFileSystemManager().readFileSync(file.path) as ArrayBuffer;
		const image = await Taro.getImageInfo({ src: file.path });
		contentType = toContentType(image.type);
	}
	if (bytes.byteLength === 0) throw new Error(t("这个图片是空的", "That image is empty"));
	if (bytes.byteLength > AVATAR_MAX_BYTES)
		throw new Error(t("头像不能超过 2 MB", "An avatar cannot be larger than 2 MB"));
	if (!AVATAR_TYPES.includes(contentType)) throw new Error(rejectedType(contentType));
	return { bytes, contentType };
}

/** `POST /v1/bots/:id/avatar` with the bytes in the body, as the route expects them. */
export async function uploadBotAvatar(id: string, file: ChosenImage): Promise<Member> {
	const { bytes, contentType } = await readAvatar(file);
	return client.request<Member>(`/v1/bots/${encodeURIComponent(id)}/avatar`, { raw: { bytes, contentType } });
}

/** The picker, capped to one image; a cancelled picker resolves `undefined`. */
export async function chooseAvatar(): Promise<ChosenImage | undefined> {
	const result = await Taro.chooseImage({ count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"] });
	const file = result.tempFiles?.[0] ?? (result.tempFilePaths?.[0] ? { path: result.tempFilePaths[0] } : undefined);
	if (!file) return undefined;
	const chosen = file as { path: string; size?: number; type?: string };
	return {
		path: chosen.path,
		...(chosen.size === undefined ? {} : { size: chosen.size }),
		...(chosen.type ? { type: chosen.type } : {}),
	};
}
