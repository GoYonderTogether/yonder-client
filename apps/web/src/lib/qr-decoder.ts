import type { QRCode } from "jsqr";

type QrDecoder = (pixels: Uint8ClampedArray, width: number, height: number) => QRCode | null;

export async function loadQrDecoder(): Promise<QrDecoder> {
	// jsQR ships CommonJS with an ESM-shaped declaration; Vite exposes its function as default.
	return (await import("jsqr")).default as unknown as QrDecoder;
}
