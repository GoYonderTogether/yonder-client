import type { RefObject } from "react";
import { useEffect } from "react";

/** Keep the mobile frame inside the visible viewport as the keyboard moves it. */
export function useVisualViewport(ref: RefObject<HTMLElement | null>, active: boolean) {
	useEffect(() => {
		const element = ref.current;
		const viewport = window.visualViewport;
		if (!active || !element || !viewport) return;

		const update = () => {
			element.style.setProperty("--app-height", `${viewport.height}px`);
			element.style.setProperty("--app-offset-top", `${viewport.offsetTop}px`);
			const keyboardVisible =
				document.documentElement.dataset.nativeMobile === "true"
					? window.innerHeight - viewport.height > 1 || viewport.offsetTop > 1
					: window.innerHeight - viewport.height - viewport.offsetTop > 1;
			element.style.setProperty(
				"--dock-bottom-inset",
				keyboardVisible ? "0px" : "var(--safe-area-bottom, env(safe-area-inset-bottom))",
			);
		};
		update();
		viewport.addEventListener("resize", update);
		viewport.addEventListener("scroll", update);
		return () => {
			viewport.removeEventListener("resize", update);
			viewport.removeEventListener("scroll", update);
			element.style.removeProperty("--app-height");
			element.style.removeProperty("--app-offset-top");
			element.style.removeProperty("--dock-bottom-inset");
		};
	}, [ref, active]);
}
