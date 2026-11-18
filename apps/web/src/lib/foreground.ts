import { useSyncExternalStore } from "react";
import { isTauri } from "./keychain.ts";
import { isDesktopExperience } from "./platform.ts";

export function isForeground(): boolean {
	return document.visibilityState === "visible" && ((isTauri() && !isDesktopExperience()) || document.hasFocus());
}

export function subscribeForeground(change: () => void) {
	document.addEventListener("visibilitychange", change);
	window.addEventListener("focus", change);
	window.addEventListener("blur", change);
	return () => {
		document.removeEventListener("visibilitychange", change);
		window.removeEventListener("focus", change);
		window.removeEventListener("blur", change);
	};
}

export function useForeground(): boolean {
	return useSyncExternalStore(subscribeForeground, isForeground, () => false);
}
