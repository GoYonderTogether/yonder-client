import { isTauri } from "./keychain.ts";

export function isDesktopShell(): boolean {
	return isTauri() && typeof navigator !== "undefined" && !/iPhone|iPad|Android/i.test(navigator.userAgent);
}

function isIosDevice(): boolean {
	const { userAgent, maxTouchPoints } = navigator;
	return /iPhone|iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

export function isIosHomeScreenWebApp(): boolean {
	return (
		!isTauri() &&
		typeof navigator !== "undefined" &&
		"standalone" in navigator &&
		navigator.standalone === true &&
		isIosDevice()
	);
}

/** Width changes pane placement; the host decides whether desktop controls remain available. */
export function isDesktopExperience(): boolean {
	if (typeof navigator === "undefined") return false;
	return !isIosDevice() && !/Android/i.test(navigator.userAgent);
}

export function shouldShowScanner(): boolean {
	return typeof navigator !== "undefined" && !isDesktopExperience();
}

/**
 * The desktop app on macOS draws its traffic lights over the top-left corner of the window
 * (`titleBarStyle: Overlay`), so the frame keeps that corner empty. In a browser, or on Windows,
 * the corner is ours.
 */
export function isMacDesktopShell(): boolean {
	if (!isTauri() || typeof navigator === "undefined") return false;
	return /Macintosh|Mac OS X/i.test(navigator.userAgent) && !/iPhone|iPad/i.test(navigator.userAgent);
}

/** Native geometry is opt-in; a mobile browser keeps its existing layout. */
export function initializeNativeMobile() {
	if (!isTauri() || isDesktopExperience()) return;
	const root = document.documentElement;
	root.dataset.nativeMobile = "true";
	const bridge = (window as unknown as { YonderInsets?: { getInsets(): string } }).YonderInsets;
	if (!bridge) return;
	try {
		const insets = JSON.parse(bridge.getInsets()) as Record<string, unknown>;
		for (const side of ["top", "right", "bottom", "left"]) {
			const value = insets[side];
			if (typeof value === "number" && Number.isFinite(value) && value >= 0)
				root.style.setProperty(`--native-safe-area-inset-${side}`, `${value}px`);
		}
	} catch {
		// The platform-provided CSS env() remains the fallback until native insets arrive.
	}
}
