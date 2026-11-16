import Lenis from "lenis";
import { type UseScrollOptions, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { type RefObject, useEffect } from "react";
import { detectEnvironment } from "../environment.ts";

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * The page's motion root. Content is complete without it: CSS only reads `--p` and the hidden
 * reveal and scrub states under `[data-js]`, which this sets only when motion is allowed.
 *
 * - Desktop with a fine pointer, outside in-app browsers: Lenis damps the wheel (follow-the-hand
 *   inertia). Touch keeps native scrolling, which is already direct.
 * - `[data-reveal]` blocks get `data-in` once they scroll into view.
 * - The root carries `--mx`/`--my` (pointer in px) for the light field and `--nx`/`--ny`
 *   (pointer from -0.5 to 0.5) for depth parallax.
 */
export function useLandingMotion(root: RefObject<HTMLElement | null>) {
	useEffect(() => {
		const element = root.current;
		if (!element) return;
		const blocks = Array.from(element.querySelectorAll<HTMLElement>("[data-reveal]"));
		if (window.matchMedia(REDUCED).matches || typeof IntersectionObserver === "undefined") {
			for (const block of blocks) block.dataset.in = "true";
			return;
		}
		element.dataset.js = "true";

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					(entry.target as HTMLElement).dataset.in = "true";
					observer.unobserve(entry.target);
				}
			},
			{ rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
		);
		for (const block of blocks) observer.observe(block);

		const environment = detectEnvironment(navigator.userAgent, navigator.maxTouchPoints);
		const fine = window.matchMedia("(pointer: fine)").matches;
		const lenis =
			fine && environment.type === "browser"
				? new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, autoRaf: true, anchors: { offset: -72 } })
				: null;

		let frame = 0;
		let x = 0;
		let y = 0;
		const onPointer = (event: PointerEvent) => {
			if (event.pointerType !== "mouse") return;
			x = event.clientX;
			y = event.clientY;
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				element.style.setProperty("--mx", `${x}px`);
				element.style.setProperty("--my", `${y}px`);
				element.style.setProperty("--nx", (x / window.innerWidth - 0.5).toFixed(3));
				element.style.setProperty("--ny", (y / window.innerHeight - 0.5).toFixed(3));
			});
		};
		window.addEventListener("pointermove", onPointer, { passive: true });

		return () => {
			observer.disconnect();
			lenis?.destroy();
			window.removeEventListener("pointermove", onPointer);
			if (frame) cancelAnimationFrame(frame);
			delete element.dataset.js;
		};
	}, [root]);
}

/**
 * Writes a section's scroll progress (0 to 1) as `--p`, through a spring so scrubbing keeps a
 * little inertia instead of snapping to the wheel. Returns the smoothed value for JS consumers.
 */
export function useScrollProgress(
	ref: RefObject<HTMLElement | null>,
	offset: UseScrollOptions["offset"] = ["start start", "end end"],
) {
	const { scrollYProgress } = useScroll({ target: ref, offset });
	const smooth = useSpring(scrollYProgress, { stiffness: 180, damping: 34, mass: 0.5, restDelta: 0.0005 });
	useMotionValueEvent(smooth, "change", (value) => {
		ref.current?.style.setProperty("--p", value.toFixed(4));
	});
	useEffect(() => {
		ref.current?.style.setProperty("--p", smooth.get().toFixed(4));
	}, [ref, smooth]);
	return smooth;
}
