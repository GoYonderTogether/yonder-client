import { createHash } from "node:crypto";
import { expect, test, vi } from "vitest";
import { decodeFileText, verifyDeviceFile } from "./device-file-bytes";

test("connectors verify binary SHA-256 before decoding multiple chunks of Chinese text", () => {
	const source = "口播稿 📄\n".repeat(1400);
	const bytes = new TextEncoder().encode(source).buffer;
	const digest = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
	expect(verifyDeviceFile(bytes, digest)).toBe(true);
	expect(verifyDeviceFile(bytes, "0".repeat(64))).toBe(false);
	expect(decodeFileText(bytes)).toBe(source);
});

test("older WeChat hosts preserve multi-byte letters and reject invalid UTF-8 across decode sections", () => {
	const text = `\uFEFF${"x".repeat(8188)}📄\r\n读完一段，再继续。`;
	const bytes = new TextEncoder().encode(text);
	vi.stubGlobal("TextDecoder", undefined);
	try {
		expect(decodeFileText(bytes.buffer)).toBe(text.slice(1));
		expect(() => decodeFileText(bytes.slice(0, 8193).buffer)).toThrow(URIError);
	} finally {
		vi.unstubAllGlobals();
	}
});
