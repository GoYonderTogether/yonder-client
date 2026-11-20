import { useCallback, useLayoutEffect, useRef, useState } from "react";

function atEnd(scroll: HTMLElement) {
	// scrollTop can be fractional while the scroll dimensions are rounded.
	return scroll.clientHeight > 0 && scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 2;
}

/** Follow the reader's position, never the arrival rate of the response. */
export function useMessageScroll(conversationId: string | null, items: readonly { id: string }[] | undefined) {
	const bottom = useRef<HTMLDivElement>(null);
	const follow = useRef(true);
	const pendingScrollTop = useRef<number | null>(null);
	const previous = useRef<{ conversationId: string | null; first: string; last: string; height: number } | null>(null);
	const [showLatest, setShowLatest] = useState(false);
	const [atLatest, setAtLatest] = useState(false);
	const [endVisible, setEndVisible] = useState(typeof IntersectionObserver === "undefined");
	const hasItems = Boolean(items?.length);
	const viewport = useCallback(() => bottom.current?.closest<HTMLElement>(".overflow-y-auto"), []);
	const canReadLatest = useCallback(() => {
		const scroll = viewport();
		return Boolean(scroll && atEnd(scroll) && !scroll.closest("[inert], [hidden], [aria-hidden=true]"));
	}, [viewport]);
	const measure = useCallback((scroll: HTMLElement) => {
		setAtLatest(atEnd(scroll));
		setShowLatest(scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop > 120);
	}, []);
	const scrollToEnd = useCallback((scroll: HTMLElement) => {
		scroll.scrollTop = scroll.scrollHeight;
		pendingScrollTop.current = scroll.scrollTop;
	}, []);
	const jumpToLatest = useCallback(() => {
		const scroll = viewport();
		if (!scroll) return;
		scrollToEnd(scroll);
		follow.current = true;
		measure(scroll);
	}, [measure, scrollToEnd, viewport]);

	useLayoutEffect(() => {
		if (!conversationId || !hasItems) return;
		const scroll = viewport();
		if (!scroll) return;
		follow.current = true;
		pendingScrollTop.current = null;
		previous.current = null;
		setShowLatest(false);
		const onScroll = () => {
			const top = scroll.scrollTop;
			const distance = scroll.scrollHeight - scroll.clientHeight - top;
			// A jump's event can arrive after the dock has already changed the scroll range.
			if (top !== pendingScrollTop.current) follow.current = distance <= 2;
			pendingScrollTop.current = null;
			measure(scroll);
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
		// The native dock changes the scroller's padding even when its outer size stays fixed.
		const observer = new ResizeObserver(() => {
			if (previous.current) previous.current.height = scroll.scrollHeight;
			if (follow.current) scrollToEnd(scroll);
			measure(scroll);
		});
		observer.observe(scroll);
		if (bottom.current?.parentElement) observer.observe(bottom.current.parentElement);
		const intersection =
			typeof IntersectionObserver === "undefined"
				? null
				: new IntersectionObserver(([entry]) => {
						setEndVisible(Boolean(entry?.isIntersecting));
					});
		if (bottom.current) intersection?.observe(bottom.current);
		return () => {
			observer.disconnect();
			intersection?.disconnect();
			scroll.removeEventListener("scroll", onScroll);
			scroll.removeEventListener("wheel", interrupt);
			scroll.removeEventListener("touchmove", interrupt);
			scroll.removeEventListener("pointerdown", interrupt);
			scroll.removeEventListener("keydown", onKeyDown);
		};
	}, [conversationId, hasItems, measure, scrollToEnd, viewport]);

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
			scrollToEnd(scroll);
		}
		measure(scroll);
		previous.current = { conversationId, first, last, height: scroll.scrollHeight };
	}, [conversationId, items, measure, scrollToEnd, viewport]);

	return { bottom, showLatest, atBottom: atLatest, atLatest: atLatest && endVisible, canReadLatest, jumpToLatest };
}
