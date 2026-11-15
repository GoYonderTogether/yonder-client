/** Inspect ZIP metadata before a browser parser expands an untrusted Office document. */
export function validateDocxSize(buffer: ArrayBuffer): void {
	const view = new DataView(buffer);
	let end = -1;
	for (let offset = buffer.byteLength - 22; offset >= Math.max(0, buffer.byteLength - 65557); offset--) {
		if (view.getUint32(offset, true) === 0x06054b50) {
			end = offset;
			break;
		}
	}
	if (end < 0) throw new Error("docx_invalid");
	const count = view.getUint16(end + 10, true);
	let offset = view.getUint32(end + 16, true);
	let total = 0;
	if (count > 2000) throw new Error("docx_too_large");
	for (let index = 0; index < count; index++) {
		if (offset + 46 > buffer.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error("docx_invalid");
		total += view.getUint32(offset + 24, true);
		if (total > 64 * 1024 * 1024 || view.getUint16(offset + 8, true) & 1) throw new Error("docx_too_large");
		offset +=
			46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
	}
}
