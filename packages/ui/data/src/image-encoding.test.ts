import { afterEach, expect, test, vi } from "vitest";
import { AvatarImageTooLargeError, prepareAvatarImage } from "./image-encoding.ts";

const limit = 2 * 1024 * 1024;

afterEach(() => vi.unstubAllGlobals());

test("avatars at the wire limit stay original and oversized animated WebP is not flattened", async () => {
	const original = new Blob([new Uint8Array(limit)], { type: "image/png" });
	expect(await prepareAvatarImage(original)).toBe(original);
	const animated = new Uint8Array(limit + 1);
	animated.set(new TextEncoder().encode("RIFF"));
	animated.set(new TextEncoder().encode("WEBPVP8X"), 8);
	animated[20] = 2;
	const bitmap = vi.fn();
	vi.stubGlobal("createImageBitmap", bitmap);
	await expect(prepareAvatarImage(new Blob([animated], { type: "image/webp" }))).rejects.toBeInstanceOf(
		AvatarImageTooLargeError,
	);
	expect(bitmap).not.toHaveBeenCalled();
});
