import { useLayoutEffect, useRef } from "react";

/** Reserve the actual chrome height, including growing composers and changing system insets. */
export function useChromeSize(property: string, active = true, onHeightChange?: (height: number) => void) {
	const ref = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const element = ref.current;
		const parent = element?.parentElement;
		const native = document.documentElement.dataset.nativeMobile === "true";
		if (!active || !element || !parent || (!native && !onHeightChange)) return;
		const update = () => {
			const height = element.getBoundingClientRect().height;
			if (native) parent.style.setProperty(property, `${height}px`);
			onHeightChange?.(height);
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(element);
		return () => {
			observer.disconnect();
			if (native) parent.style.removeProperty(property);
		};
	}, [property, active, onHeightChange]);
	return ref;
}
