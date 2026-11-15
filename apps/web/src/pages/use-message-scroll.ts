import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Follow the reader's position, never the arrival rate of the response. */
export function useMessageScroll(conversationId: string | null, items: readonly { id: string }[] | undefined) {
	const bottom = useRef<HTMLDivElement>(null);
	const follow = useRef(true);
	const previous = useRef<{ conversationId: string | null; first: string; last: string; height: number } | null>(null);
	const [showLatest, setShowLatest] = useState(false);
	const hasItems = Boolean(items?.length);
	const viewport = useCallback(() => bottom.current?.closest<HTMLElement>(".overflow-y-auto"), []);
	const jumpToLatest = useCallback(() => {
		const scroll = viewport();
		if (!scroll) return;
		scroll.scrollTop = scroll.scrollHeight;
		follow.current = true;
		setShowLatest(false);
	}, [viewport]);

	useLayoutEffect(() => {
		if (!conversationId || !hasItems) return;
		const scroll = viewport();
		if (!scroll) return;
		follow.current = true;
		previous.current = null;
		setShowLatest(false);
		const onScroll = () => {
			const distance = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
			follow.current = distance <= 40;
			setShowLatest(distance > 120);
		};
		const interrupt = () => {
			follow.current = false;
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) interrupt();
		};
		scroll.addEventListener("scroll", onScroll, { passive: true });
		scroll.addEventListener("wheel", interrupt, { passive: true });
		scroll.addEventListener("touchmove", interrupt, { passive: true });
		scroll.addEventListener("pointerdown", interrupt, { passive: true });
		scroll.addEventListener("keydown", onKeyDown);
		return () => {
			scroll.removeEventListener("scroll", onScroll);
			scroll.removeEventListener("wheel", interrupt);
			scroll.removeEventListener("touchmove", interrupt);
			scroll.removeEventListener("pointerdown", interrupt);
			scroll.removeEventListener("keydown", onKeyDown);
		};
	}, [conversationId, hasItems, viewport]);

	useLayoutEffect(() => {
		const scroll = viewport();
		if (!scroll || !items?.length) return;
		const old = previous.current;
		const first = items[0]?.id ?? "";
		const last = items[items.length - 1]?.id ?? "";
		if (old?.conversationId === conversationId && old.first !== first && old.last === last) {
			// Preserve the reading position when an older page is prepended.
			scroll.scrollTop += scroll.scrollHeight - old.height;
		} else if (follow.current) {
			scroll.scrollTop = scroll.scrollHeight;
		}
		setShowLatest(scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop > 120);
		previous.current = { conversationId, first, last, height: scroll.scrollHeight };
	}, [conversationId, items, viewport]);

	return { bottom, showLatest, jumpToLatest };
}
