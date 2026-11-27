import { useEffect, useState } from "react";

/**
 * Whether the present should be showing above the composer. On the memory timeline it rises when the
 * "now" marker is on or near the screen and settles away while the owner reads older days; on any
 * page without that marker (tasks, lists) it stays shown. The marker comes and goes with the page, so
 * the hook watches the document rather than holding a ref into the timeline.
 */
export function useNearNow(): boolean {
	const [near, setNear] = useState(true);
	useEffect(() => {
		let io: IntersectionObserver | undefined;
		let target: Element | null = null;
		const attach = () => {
			const found = document.querySelector(".memory-now");
			if (found === target) return;
			io?.disconnect();
			target = found;
			if (!found || typeof IntersectionObserver === "undefined") {
				setNear(true);
				return;
			}
			io = new IntersectionObserver(([entry]) => setNear(Boolean(entry?.isIntersecting)), {
				rootMargin: "0px 0px 200px 0px",
			});
			io.observe(found);
		};
		attach();
		const mutations = new MutationObserver(attach);
		mutations.observe(document.body, { childList: true, subtree: true });
		return () => {
			mutations.disconnect();
			io?.disconnect();
		};
	}, []);
	return near;
}
