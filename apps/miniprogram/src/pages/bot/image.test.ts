import { expect, test, vi } from "vitest";

const mock = vi.hoisted(() => ({
	readFile: vi.fn(
		(_path: string, _encoding?: unknown, _start?: number, _length?: number) =>
			new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
	),
	imageInfo: vi.fn(async () => ({ type: "png", width: 3000, height: 2000 })),
	stat: vi.fn(),
	compress: vi.fn(),
	chooseImage: vi.fn(),
}));

vi.mock("@tarojs/taro", () => ({
	default: {
		getStorageSync: () => "en",
		setStorageSync: () => {},
		getSystemInfoSync: () => ({ language: "en" }),
		getFileSystemManager: () => ({ readFileSync: mock.readFile, statSync: mock.stat }),
		getImageInfo: mock.imageInfo,
		chooseImage: mock.chooseImage,
		compressImage: mock.compress,
	},
}));

import { AVATAR_MAX_BYTES, readAvatar } from "../../lib/local-image";
import { chooseAvatar } from "./image";

test("an unrecognized oversized image is refused after reading only a bounded header", async () => {
	mock.readFile.mockClear();
	await expect(readAvatar({ path: "/tmp/big.png", size: AVATAR_MAX_BYTES + 1 })).rejects.toThrow(
		"An avatar cannot be larger than 2 MB",
	);
	expect(mock.readFile.mock.calls).toEqual([["/tmp/big.png", undefined, 0, 65_536]]);
	expect(mock.compress).not.toHaveBeenCalled();
});

test("the type comes from the file itself, and WebP, PNG and JPEG are accepted", async () => {
	await expect(readAvatar({ path: "/tmp/a.png", size: 10 })).resolves.toMatchObject({ contentType: "image/png" });
	mock.imageInfo.mockResolvedValueOnce({ type: "jpg", width: 1, height: 1 });
	await expect(readAvatar({ path: "/tmp/a.jpg" })).resolves.toMatchObject({ contentType: "image/jpeg" });
	mock.imageInfo.mockResolvedValueOnce({ type: "webp", width: 1, height: 1 });
	await expect(readAvatar({ path: "/tmp/a.webp" })).resolves.toMatchObject({ contentType: "image/webp" });
});

test("anything else is refused with the type named, never uploaded", async () => {
	mock.imageInfo.mockResolvedValueOnce({ type: "gif", width: 1, height: 1 });
	await expect(readAvatar({ path: "/tmp/a.gif" })).rejects.toThrow("image/gif");
	mock.readFile.mockReturnValueOnce(new ArrayBuffer(0));
	await expect(readAvatar({ path: "/tmp/empty.png", size: 0 })).rejects.toThrow("That image is empty");
	// The size WeChat reports is not trusted alone: the bytes are counted too.
	mock.readFile.mockReturnValueOnce(new ArrayBuffer(AVATAR_MAX_BYTES + 1));
	await expect(readAvatar({ path: "/tmp/sneaky.png", size: 10 })).rejects.toThrow("cannot be larger than 2 MB");
});

test("an oversized photo is resized locally, then read from the verified output", async () => {
	mock.readFile.mockClear();
	mock.readFile.mockReturnValueOnce(new Uint8Array([0xff, 0xd8, 0xff]).buffer);
	mock.compress.mockResolvedValueOnce({ tempFilePath: "/tmp/fitted.png" });
	mock.stat.mockReturnValueOnce({ size: 4 });
	await expect(readAvatar({ path: "/tmp/big.jpg", size: AVATAR_MAX_BYTES + 1 })).resolves.toMatchObject({
		contentType: "image/png",
	});
	expect(mock.compress).toHaveBeenLastCalledWith({ src: "/tmp/big.jpg", quality: 75, compressedWidth: 1280 });
	expect(mock.readFile.mock.calls.map(([path]) => path)).toEqual(["/tmp/big.jpg", "/tmp/fitted.png"]);
});

test("a compression failure with a statted original does not read oversized source bytes", async () => {
	mock.readFile.mockClear();
	mock.stat.mockReturnValueOnce({ size: AVATAR_MAX_BYTES + 1 });
	mock.readFile.mockReturnValueOnce(new Uint8Array([0xff, 0xd8, 0xff]).buffer);
	mock.compress.mockRejectedValueOnce(new Error("unsupported"));
	await expect(readAvatar({ path: "/tmp/avatar-from-wechat.jpg" })).rejects.toThrow("cannot be larger than 2 MB");
	expect(mock.readFile.mock.calls).toEqual([["/tmp/avatar-from-wechat.jpg", undefined, 0, 65_536]]);
});

test("the picker is capped at one image and a cancelled picker resolves nothing", async () => {
	mock.chooseImage.mockReset();
	mock.chooseImage.mockResolvedValueOnce({
		tempFiles: [{ path: "/tmp/a.png", size: 12 }],
		tempFilePaths: ["/tmp/a.png"],
	});
	await expect(chooseAvatar()).resolves.toEqual({ path: "/tmp/a.png", size: 12 });
	expect(mock.chooseImage).toHaveBeenCalledWith({
		count: 1,
		sizeType: ["compressed"],
		sourceType: ["album", "camera"],
	});
	mock.chooseImage.mockResolvedValueOnce({ tempFiles: [], tempFilePaths: [] });
	await expect(chooseAvatar()).resolves.toBeUndefined();
});
