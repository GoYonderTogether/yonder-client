import Taro from "@tarojs/taro";
import { useEffect, useId, useState } from "react";

/** Gate the download itself, so mounting an offscreen card does not request media. */
export function useVisibleImage(enabled: boolean, viewport?: string) {
	const reactId = useId();
	const id = `mini-image-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
	const [visible, setVisible] = useState(false);
	useEffect(() => {
		if (!enabled || visible) return;
		const page = Taro.getCurrentInstance().page;
		if (!page) return;
		let active = true;
		let observer: Taro.IntersectionObserver | undefined;
		Taro.nextTick(() => {
			if (!active) return;
			observer = Taro.createIntersectionObserver(page, { thresholds: [0, 0.01] });
			const reference = viewport ? observer.relativeTo(viewport) : observer.relativeToViewport();
			reference.observe(`#${id}`, ({ intersectionRatio = 0 }) => {
				if (active && intersectionRatio > 0) setVisible(true);
			});
		});
		return () => {
			active = false;
			observer?.disconnect();
		};
	}, [enabled, id, viewport, visible]);
	return { id, visible };
}
