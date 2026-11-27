/** The system share sheet, where the engine has one (iOS, Android, macOS WebKit, recent Chromium). */
export function canShareNatively(): boolean {
	return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/** Shares through the system sheet; closing the sheet is not a failure. */
export async function shareNatively(data: ShareData): Promise<void> {
	try {
		await navigator.share(data);
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") return;
		throw error;
	}
}
