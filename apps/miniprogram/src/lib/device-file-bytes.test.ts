import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { decodeFileText, verifyDeviceFile } from "./device-file-bytes";

test("connectors verify binary SHA-256 before decoding multiple chunks of Chinese text", () => {
	const source = "口播稿 📄\n".repeat(1400);
	const bytes = new TextEncoder().encode(source).buffer;
	const digest = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
	expect(verifyDeviceFile(bytes, digest)).toBe(true);
	expect(verifyDeviceFile(bytes, "0".repeat(64))).toBe(false);
	expect(decodeFileText(bytes)).toBe(source);
});
