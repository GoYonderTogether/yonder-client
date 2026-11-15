/** Keep original bytes; a JPEG is only a display/processing fallback for unsupported HEIC. */
export async function isHeicImage(blob: Blob, name = ""): Promise<boolean> {
	if (/\.(heic|heif)$/i.test(name) || /image\/hei[cf]/i.test(blob.type)) return true;
	const header = new TextDecoder("ascii").decode(await blob.slice(0, 64).arrayBuffer());
	return (
		header.slice(4, 8) === "ftyp" && /hei[csx]|hevc|hevx|heim|heis|mif1|msf1/.test(header) && !/avif|avis/.test(header)
	);
}

async function nativeImage(blob: Blob): Promise<void> {
	const address = URL.createObjectURL(blob);
	try {
		const image = new Image();
		image.src = address;
		await image.decode();
	} finally {
		URL.revokeObjectURL(address);
	}
}

export async function ensureDisplayBlob(blob: Blob, name?: string): Promise<Blob> {
	try {
		await nativeImage(blob);
		return blob;
	} catch (error) {
		if (!(await isHeicImage(blob, name))) throw error;
	}
	const { heicTo } = await import("heic-to/csp");
	const converted = await heicTo({ blob, type: "image/jpeg", quality: 0.92 });
	if (!(converted instanceof Blob)) throw new Error("image_conversion_failed");
	return converted;
}
