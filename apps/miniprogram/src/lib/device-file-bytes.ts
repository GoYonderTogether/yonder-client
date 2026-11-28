import sha256 from "node-forge/lib/sha256.js";

export function deviceTextDigest(text: string) {
	const hash = sha256.create();
	hash.update(text, "utf8");
	return hash.digest().toHex();
}

export function verifyDeviceFile(bytes: ArrayBuffer, expected: string): boolean {
	if (!/^[a-f0-9]{64}$/.test(expected)) return false;
	const view = new Uint8Array(bytes);
	const digest = sha256.create();
	for (let offset = 0; offset < view.length; offset += 8192)
		digest.update(String.fromCharCode(...view.subarray(offset, offset + 8192)));
	return digest.digest().toHex() === expected;
}

/** Older WeChat JS hosts supply ArrayBuffer without a DOM TextDecoder. */
export function decodeFileText(bytes: ArrayBuffer): string {
	if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	const view = new Uint8Array(bytes);
	const parts: string[] = [];
	for (let start = 0; start < view.length; ) {
		let end = Math.min(start + 8192, view.length);
		// Don't cut a UTF-8 code point between chunks on older mini program hosts.
		if (end < view.length) {
			while (end > start && ((view[end] ?? 0) & 0xc0) === 0x80) end -= 1;
			if (end === start) throw new URIError("Invalid UTF-8");
		}
		parts.push(
			decodeURIComponent(
				Array.from(view.subarray(start, end), (byte) => `%${byte.toString(16).padStart(2, "0")}`).join(""),
			),
		);
		start = end;
	}
	return parts.join("").replace(/^\uFEFF/u, "");
}

export interface DeviceFile {
	kind: "file";
	name: string;
	mime: string;
	sha256: string;
	bytes: ArrayBuffer;
	localPath?: string;
}
