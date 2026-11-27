import sha256 from "node-forge/lib/sha256.js";

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
	return decodeURIComponent(
		Array.from(new Uint8Array(bytes), (byte) => `%${byte.toString(16).padStart(2, "0")}`).join(""),
	).replace(/^\uFEFF/u, "");
}

export interface DeviceFile {
	kind: "file";
	name: string;
	mime: string;
	sha256: string;
	bytes: ArrayBuffer;
}
