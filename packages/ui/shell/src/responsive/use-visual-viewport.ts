import type { RefObject } from "react";
import { useEffect, useState } from "react";

const SAFE_BOTTOM = "var(--safe-area-bottom, env(safe-area-inset-bottom))";
const KEYBOARD_INPUTS = new Set(["email", "number", "password", "search", "tel", "text", "url"]);

function hasTextFocus() {
	const focused = document.activeElement;
	if (!(focused instanceof HTMLElement) || focused.inputMode === "none") return false;
	if (focused.isContentEditable) return true;
	return (
		(focused instanceof HTMLTextAreaElement ||
			(focused instanceof HTMLInputElement && KEYBOARD_INPUTS.has(focused.type))) &&
		!focused.readOnly &&
		!focused.disabled
	);
}

/**
 * Keep the mobile frame inside the visible viewport as the keyboard moves it, and report whether
 * the keyboard is up so the phone's tab bar can step aside for it.
 *
 * The iOS app announces the keyboard's final height and duration as the keyboard starts to move
 * (apps/desktop/apple/KeyboardFollow.mm), and the frame resizes in that same animation. Browsers
 * only report the visual viewport once it has changed, so there the frame follows it.
 */
export function useVisualViewport(ref: RefObject<HTMLElement | null>, active: boolean) {
	const [keyboard, setKeyboard] = useState(false);
	useEffect(() => {
		const element = ref.current;
		const viewport = window.visualViewport;
		if (!active || !element) return;
		let keyboardHeight: number | undefined;
		let layoutWidth = window.innerWidth;
		let closedHeight = window.innerHeight;
		let focusFrame = 0;

		const apply = (height: number, offsetTop: number, visible: boolean) => {
			element.style.setProperty("--app-height", `${height}px`);
			element.style.setProperty("--app-offset-top", `${offsetTop}px`);
			element.style.setProperty("--dock-bottom-inset", visible ? "0px" : SAFE_BOTTOM);
			setKeyboard(visible);
		};
		const update = () => {
			if (keyboardHeight !== undefined) {
				apply(window.innerHeight - keyboardHeight, 0, keyboardHeight > 0);
				return;
			}
			const height = viewport?.height ?? window.innerHeight;
			const offsetTop = viewport?.offsetTop ?? 0;
			const { nativeMobile, nativeKeyboard } = document.documentElement.dataset;
			const focused = hasTextFocus();
			if (nativeMobile === "true" && (!focused || layoutWidth !== window.innerWidth)) {
				layoutWidth = window.innerWidth;
				closedHeight = window.innerHeight;
			}
			// Legacy native WebViews may resize both viewports as one.
			const covered =
				nativeMobile === "true" ? Math.max(closedHeight - height, offsetTop) : window.innerHeight - height - offsetTop;
			// Browser toolbars and pinch zoom also alter the visual viewport. The browser exposes no
			// keyboard event, so require an editable field and meaningful loss of unzoomed space.
			const visible =
				nativeKeyboard === undefined
					? focused && Math.abs((viewport?.scale ?? 1) - 1) < 0.01 && covered >= 80
					: nativeKeyboard === "true";
			if (viewport || nativeMobile === "true") apply(height, offsetTop, visible);
		};
		const follow = (event: Event) => {
			const detail = (event as CustomEvent<{ height?: unknown; duration?: unknown }>).detail;
			keyboardHeight = typeof detail?.height === "number" && detail.height > 0 ? detail.height : 0;
			const duration = typeof detail?.duration === "number" && detail.duration >= 0 ? detail.duration : 0;
			// Tells the iOS host this page moves its own chrome, so it may hold the document still.
			event.preventDefault();
			element.style.setProperty("--keyboard-duration", `${duration}ms`);
			update();
		};
		const focusChanged = () => {
			cancelAnimationFrame(focusFrame);
			focusFrame = requestAnimationFrame(update);
		};
		update();
		viewport?.addEventListener("resize", update);
		viewport?.addEventListener("scroll", update);
		window.addEventListener("resize", update);
		window.addEventListener("pageshow", update);
		document.addEventListener("focusin", focusChanged);
		document.addEventListener("focusout", focusChanged);
		window.addEventListener("yonder-keyboard", follow);
		window.addEventListener("native-insets-change", update);
		return () => {
			cancelAnimationFrame(focusFrame);
			viewport?.removeEventListener("resize", update);
			viewport?.removeEventListener("scroll", update);
			window.removeEventListener("resize", update);
			window.removeEventListener("pageshow", update);
			document.removeEventListener("focusin", focusChanged);
			document.removeEventListener("focusout", focusChanged);
			window.removeEventListener("yonder-keyboard", follow);
			window.removeEventListener("native-insets-change", update);
			for (const property of ["--app-height", "--app-offset-top", "--dock-bottom-inset", "--keyboard-duration"])
				element.style.removeProperty(property);
			setKeyboard(false);
		};
	}, [ref, active]);
	return keyboard;
}
