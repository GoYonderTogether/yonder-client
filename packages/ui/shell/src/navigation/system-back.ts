/**
 * The system's own Back reaches the same exit as Escape, a title-bar button and a swipe.
 *
 * Android delivers the hardware key and the system back gesture through Tauri's `back-button`
 * event, which hands the decision to the page. The page uses the same order every other exit does:
 * the topmost open layer closes first; with no layer open, Back follows the webview's history (the
 * router's own Back); with nothing behind, it leaves the app.
 *
 * A browser tab and an iOS shell never register this, so their own Back behaves as before.
 */

/** What a Back press should do, given whether a layer is open and whether history has an earlier page. */
export function backAction(layerOpen: boolean, canGoBack: boolean): "layer" | "history" | "exit" {
	if (layerOpen) return "layer";
	return canGoBack ? "history" : "exit";
}

/** Registers the listener and returns it, or null outside a native Android shell. */
export async function listenForSystemBack(
	handler: (canGoBack: boolean) => void,
): Promise<{ unregister(): Promise<void> } | null> {
	if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return null;
	if (typeof navigator === "undefined" || !/Android/i.test(navigator.userAgent)) return null;
	try {
		const { onBackButtonPress } = await import("@tauri-apps/api/app");
		return await onBackButtonPress(({ canGoBack }) => handler(canGoBack));
	} catch {
		// A host without the app plugin keeps the webview's own Back.
		return null;
	}
}

/** Leaves the app through the activity, so Android plays its own close transition. */
export async function leaveApp(): Promise<void> {
	try {
		const { exit } = await import("@tauri-apps/api/app");
		await exit(0);
	} catch {
		// Without the app plugin there is nothing to finish; the page stays where it is.
	}
}
