import { expect, test } from "vitest";
import { decodeAttachmentText, readTextThumbnail } from "./attachment-text.ts";

test("text decoding preserves UTF-16 BOMs, Chinese legacy text and a partial UTF-8 boundary", () => {
	expect(decodeAttachmentText(new Uint8Array([255, 254, 45, 78, 135, 101]))).toBe("中文");
	expect(decodeAttachmentText(new Uint8Array([254, 255, 78, 45, 101, 135]))).toBe("中文");
	expect(decodeAttachmentText(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]))).toBe("中文");
	expect(decodeAttachmentText(new TextEncoder().encode("你好").subarray(0, 4), true)).toBe("你");
});

test("the thumbnail reads only its small beginning and renders at most 600 characters", async () => {
	const source = new Blob(["开头\n", "正文".repeat(10_000)]);
	const slice = source.slice.bind(source);
	let requested = 0;
	source.slice = (from, to, type) => {
		requested = (to ?? 0) - (from ?? 0);
		return slice(from, to, type);
	};
	const text = await readTextThumbnail(source);
	expect(requested).toBe(4096);
	expect(text.startsWith("开头\n")).toBe(true);
	expect(text.length).toBeLessThanOrEqual(600);
});
