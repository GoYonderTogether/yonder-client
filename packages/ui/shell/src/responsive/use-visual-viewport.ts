import type { RefObject } from "react";
import { useEffect, useState } from "react";

const SAFE_BOTTOM = "var(--safe-area-bottom, env(safe-area-inset-bottom))";

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
		if (!active || !element || !viewport) return;
		let native = false;

		const apply = (height: number, offsetTop: number, visible: boolean) => {
			element.style.setProperty("--app-height", `${height}px`);
			element.style.setProperty("--app-offset-top", `${offsetTop}px`);
			element.style.setProperty("--dock-bottom-inset", visible ? "0px" : SAFE_BOTTOM);
			setKeyboard(visible);
		};
		const update = () => {
			if (native) return;
			const visible =
				document.documentElement.dataset.nativeMobile === "true"
					? window.innerHeight - viewport.height > 1 || viewport.offsetTop > 1
					: window.innerHeight - viewport.height - viewport.offsetTop > 1;
			apply(viewport.height, viewport.offsetTop, visible);
		};
		const follow = (event: Event) => {
			const detail = (event as CustomEvent<{ height?: unknown; duration?: unknown }>).detail;
			const height = typeof detail?.height === "number" && detail.height > 0 ? detail.height : 0;
			const duration = typeof detail?.duration === "number" && detail.duration >= 0 ? detail.duration : 0;
			native = true;
			// Tells the iOS host this page moves its own chrome, so it may hold the document still.
			event.preventDefault();
			element.style.setProperty("--keyboard-duration", `${duration}ms`);
			apply(window.innerHeight - height, 0, height > 0);
		};
		update();
		viewport.addEventListener("resize", update);
		viewport.addEventListener("scroll", update);
		window.addEventListener("yonder-keyboard", follow);
		return () => {
			viewport.removeEventListener("resize", update);
			viewport.removeEventListener("scroll", update);
			window.removeEventListener("yonder-keyboard", follow);
			for (const property of ["--app-height", "--app-offset-top", "--dock-bottom-inset", "--keyboard-duration"])
				element.style.removeProperty(property);
			setKeyboard(false);
		};
	}, [ref, active]);
	return keyboard;
}
