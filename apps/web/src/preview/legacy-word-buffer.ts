import { Buffer } from "buffer/";

// The OLE reader expects Node's Buffer. Limit allocations from untrusted sector counts in this worker.
const max = 32 * 1024 * 1024;
function checkSize(size: number) {
	if (!Number.isSafeInteger(size) || size < 0 || size > max) throw new Error("word_preview_too_large");
}

Object.assign(globalThis, {
	Buffer: {
		alloc(size: number) {
			checkSize(size);
			return Buffer.alloc(size);
		},
		concat(parts: Uint8Array[]) {
			checkSize(parts.reduce((size, part) => size + part.byteLength, 0));
			return Buffer.concat(parts);
		},
		from: Buffer.from,
	},
});
