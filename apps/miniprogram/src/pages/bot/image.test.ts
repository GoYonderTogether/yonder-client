import { expect, test, vi } from "vitest";

const mock = vi.hoisted(() => ({
	readFile: vi.fn(() => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer),
	imageInfo: vi.fn(async () => ({ type: "png" })),
	chooseImage: vi.fn(),
	request: vi.fn(),
}));

vi.mock("@tarojs/taro", () => ({
	default: {
		getStorageSync: () => "en",
		setStorageSync: () => {},
		getSystemInfoSync: () => ({ language: "en" }),
		getFileSystemManager: () => ({ readFileSync: mock.readFile }),
		getImageInfo: mock.imageInfo,
		chooseImage: mock.chooseImage,
	},
}));
vi.mock("../../lib/runtime", () => ({ client: { request: mock.request } }));

import { AVATAR_MAX_BYTES, chooseAvatar, readAvatar, uploadBotAvatar } from "./image";

test("an oversized image is refused before its bytes are read", async () => {
	mock.readFile.mockClear();
	await expect(readAvatar({ path: "/tmp/big.png", size: AVATAR_MAX_BYTES + 1 })).rejects.toThrow(
		"An avatar cannot be larger than 2 MB",
	);
	expect(mock.readFile).not.toHaveBeenCalled();
});

test("the type comes from the file itself, and WebP, PNG and JPEG are accepted", async () => {
	await expect(readAvatar({ path: "/tmp/a.png", size: 10 })).resolves.toMatchObject({ contentType: "image/png" });
	mock.imageInfo.mockResolvedValueOnce({ type: "jpg" });
	await expect(readAvatar({ path: "/tmp/a.jpg" })).resolves.toMatchObject({ contentType: "image/jpeg" });
	mock.imageInfo.mockResolvedValueOnce({ type: "webp" });
	await expect(readAvatar({ path: "/tmp/a.webp" })).resolves.toMatchObject({ contentType: "image/webp" });
});

test("anything else is refused with the type named, never uploaded", async () => {
	mock.imageInfo.mockResolvedValueOnce({ type: "gif" });
	await expect(readAvatar({ path: "/tmp/a.gif" })).rejects.toThrow("image/gif");
	mock.readFile.mockReturnValueOnce(new ArrayBuffer(0));
	await expect(readAvatar({ path: "/tmp/empty.png", size: 0 })).rejects.toThrow("That image is empty");
	// The size WeChat reports is not trusted alone: the bytes are counted too.
	mock.readFile.mockReturnValueOnce(new ArrayBuffer(AVATAR_MAX_BYTES + 1));
	await expect(readAvatar({ path: "/tmp/sneaky.png", size: 10 })).rejects.toThrow("cannot be larger than 2 MB");
});

test("the upload posts the bytes themselves to the Bot's avatar route", async () => {
	mock.request.mockReset().mockResolvedValue({ id: "bot_1" });
	await uploadBotAvatar("bot_1", { path: "/tmp/a.png", size: 4 });
	expect(mock.request).toHaveBeenCalledWith("/v1/bots/bot_1/avatar", {
		raw: { bytes: expect.any(ArrayBuffer), contentType: "image/png" },
	});
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
