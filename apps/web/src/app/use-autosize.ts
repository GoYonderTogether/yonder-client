import type { RefObject } from "react";
import { useLayoutEffect } from "react";

/**
 * `field-sizing: content` grows a textarea by itself, so CSS alone keeps it right. Firefox and
 * older WebViews do not support it; there the field stays at `rows=1` and scrolls instead of
 * growing. This is the fallback for exactly those engines.
 */
export function supportsFieldSizing(): boolean {
	if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
	return CSS.supports("field-sizing", "content");
}

/**
 * Keep a textarea as tall as its content up to the height its CSS already caps it at, measured
 * from `scrollHeight`. The cap is read from the field's own `max-height`, so the token stays the
 * only place the height is decided. A field that `field-sizing` handles is left alone.
 *
 * `enabled` is false where another layout owns the height (the phone composer puts the field over
 * a sized mirror).
 */
export function useAutosize(input: RefObject<HTMLTextAreaElement | null>, value: string, enabled = true) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: the value is what changes the content height.
	useLayoutEffect(() => {
		const field = input.current;
		if (!field) return;
		if (!enabled || supportsFieldSizing()) {
			field.style.removeProperty("height");
			return;
		}
		/** The height the field should have for its content, before the CSS cap. */
		const natural = () => {
			const applied = field.style.height;
			field.style.removeProperty("height");
			const content = field.scrollHeight;
			// Growing needs the field's own height out of the way to read the content height; put the
			// previous value back even when the read produced nothing.
			if (!content) {
				if (applied) field.style.height = applied;
				return 0;
			}
			const cap = Number.parseFloat(getComputedStyle(field).maxHeight);
			return Number.isFinite(cap) && cap > 0 ? Math.min(content, cap) : content;
		};
		const fit = () => {
			const height = natural();
			// A field with no layout yet (hidden or detached) reports 0: leave its height to CSS.
			if (height) field.style.height = `${height}px`;
		};
		fit();
		const observer =
			typeof ResizeObserver === "undefined"
				? undefined
				: new ResizeObserver(() => {
						// A width change re-wraps the text, and an interface-size or font change is new
						// content height: both need a fresh fit. A height change is our own doing.
						const applied = Number.parseFloat(field.style.height);
						if (Number.isFinite(applied) && Math.abs(natural() - applied) < 0.5) {
							field.style.height = `${applied}px`;
							return;
						}
						fit();
					});
		observer?.observe(field);
		return () => observer?.disconnect();
	}, [input, value, enabled]);
}
