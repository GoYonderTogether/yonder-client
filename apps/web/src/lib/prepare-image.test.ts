import { afterEach, expect, test, vi } from "vitest";
import { imageSize, prepareImage } from "./prepare-image.ts";

vi.mock("./image-display.ts", () => ({ ensureDisplayBlob: async (blob: Blob) => blob }));
afterEach(() => vi.unstubAllGlobals());

test("image sizing never enlarges and keeps the longest edge within the current policy", () => {
	expect(imageSize(4000, 2000)).toEqual({ width: 2048, height: 1024 });
	expect(imageSize(100, 200)).toEqual({ width: 100, height: 200 });
});

function encoder(size: number, width = 4000, height = 2000) {
	const close = vi.fn();
	const bitmap = vi.fn().mockResolvedValue({ width, height, close });
	const drawImage = vi.fn();
	const canvas = {
		width: 0,
		height: 0,
		getContext: () => ({ drawImage }),
		toBlob: vi.fn((callback: BlobCallback, mime: string) => callback(new Blob([new Uint8Array(size)], { type: mime }))),
	};
	vi.stubGlobal("createImageBitmap", bitmap);
	vi.stubGlobal("document", { createElement: () => canvas });
	return { canvas, close, bitmap };
}

test("JPEG optimization uses EXIF-aware decoding, smaller bytes, and a new upload identity", async () => {
	const source = new Blob([new Uint8Array(2000)], { type: "image/jpeg" });
	const { canvas, bitmap, close } = encoder(500);
	const result = await prepareImage(source, "photo.jpeg");
	expect(result).toMatchObject({ name: "photo.jpg", mimeType: "image/jpeg", width: 2048, height: 1024 });
	expect(result?.blob.size).toBe(500);
	expect(result?.nonce).toBeTruthy();
	expect(bitmap).toHaveBeenCalledWith(source, { imageOrientation: "from-image" });
	expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.86);
	expect(close).toHaveBeenCalledOnce();
});

test("transparent formats use WebP and a larger encoding never replaces the original", async () => {
	const source = new Blob([new Uint8Array(100)], { type: "image/png" });
	const { canvas } = encoder(200, 10, 10);
	expect(await prepareImage(source, "transparent.png")).toBeUndefined();
	expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.86);
});

test("animated GIF, WebP and APNG plus SVG remain byte-for-byte original", async () => {
	const { bitmap } = encoder(1);
	await expect(prepareImage(new Blob(["GIF89a"], { type: "image/gif" }), "animated.gif")).resolves.toBeUndefined();
	const webp = new Uint8Array(32);
	webp.set(new TextEncoder().encode("RIFF"));
	webp.set(new TextEncoder().encode("WEBPVP8X"), 8);
	webp[20] = 2;
	await expect(prepareImage(new Blob([webp], { type: "image/webp" }), "animated.webp")).resolves.toBeUndefined();
	const png = new Uint8Array(32);
	png.set([137, 80, 78, 71, 13, 10, 26, 10]);
	png.set(new TextEncoder().encode("acTL"), 12);
	await expect(prepareImage(new Blob([png], { type: "image/png" }), "animated.png")).resolves.toBeUndefined();
	await expect(prepareImage(new Blob(["<svg/>"], { type: "image/svg+xml" }), "drawing.svg")).resolves.toBeUndefined();
	for (const brand of ["avis", "msf1"]) {
		const sequence = new Uint8Array(32);
		sequence.set(new TextEncoder().encode(`ftyp${brand}`), 4);
		await expect(prepareImage(new Blob([sequence], { type: "image/avif" }), "sequence.avif")).resolves.toBeUndefined();
	}
	expect(bitmap).not.toHaveBeenCalled();
});
