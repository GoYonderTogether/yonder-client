import { useLayoutEffect, useRef } from "react";

/** Reserve the actual chrome height, including growing composers and changing system insets. */
export function useChromeSize(property: string, active = true) {
	const ref = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const element = ref.current;
		const parent = element?.parentElement;
		if (!active || !element || !parent || document.documentElement.dataset.nativeMobile !== "true") return;
		const update = () => parent.style.setProperty(property, `${element.getBoundingClientRect().height}px`);
		update();
		const observer = new ResizeObserver(update);
		observer.observe(element);
		return () => {
			observer.disconnect();
			parent.style.removeProperty(property);
		};
	}, [property, active]);
	return ref;
}
