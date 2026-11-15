import { type RefObject, useEffect } from "react";

/**
 * The landing page's one motion system. Content is visible without it: the page only hides
 * `[data-reveal]` blocks once `data-js` is on the root, and reduced motion never sets it.
 * Blocks marked `[data-reveal]` get `data-in` when they scroll into view; the root carries
 * `--lp-scroll` (pixels scrolled) and the hero `--lp-px`/`--lp-py` (pointer, -1 to 1) for parallax.
 */
export function useLandingMotion(root: RefObject<HTMLElement | null>) {
	useEffect(() => {
		const element = root.current;
		if (!element) return;
		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const blocks = Array.from(element.querySelectorAll<HTMLElement>("[data-reveal]"));
		if (reduced || typeof IntersectionObserver === "undefined") {
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
			{ rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
		);
		for (const block of blocks) observer.observe(block);

		let frame = 0;
		const onScroll = () => {
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				element.style.setProperty("--lp-scroll", String(Math.round(window.scrollY)));
			});
		};
		const hero = element.querySelector<HTMLElement>("[data-hero]");
		const onPointer = (event: PointerEvent) => {
			if (!hero || event.pointerType !== "mouse") return;
			const box = hero.getBoundingClientRect();
			hero.style.setProperty("--lp-px", ((event.clientX - box.left) / box.width - 0.5).toFixed(3));
			hero.style.setProperty("--lp-py", ((event.clientY - box.top) / box.height - 0.5).toFixed(3));
		};
		window.addEventListener("scroll", onScroll, { passive: true });
		hero?.addEventListener("pointermove", onPointer);
		onScroll();

		return () => {
			observer.disconnect();
			window.removeEventListener("scroll", onScroll);
			hero?.removeEventListener("pointermove", onPointer);
			if (frame) cancelAnimationFrame(frame);
			delete element.dataset.js;
		};
	}, [root]);
}
