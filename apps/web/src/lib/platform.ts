import { isTauri } from "./keychain.ts";

/**
 * The desktop app on macOS draws its traffic lights over the top-left corner of the window
 * (`titleBarStyle: Overlay`), so the frame keeps that corner empty. In a browser, or on Windows,
 * the corner is ours.
 */
export function isMacDesktopShell(): boolean {
	if (!isTauri() || typeof navigator === "undefined") return false;
	return /Macintosh|Mac OS X/i.test(navigator.userAgent) && !/iPhone|iPad/i.test(navigator.userAgent);
}
