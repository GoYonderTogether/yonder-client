import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
	appendedSince,
	isAtEnd,
	isLatestAway,
	isOwnMessage,
	READ_END_DISTANCE,
	type ScrollItem,
} from "./message-scroll-rules.ts";

/** Follow the reader's position, never the arrival rate of the response. */
export function useMessageScroll(
	conversationId: string | null,
	items: readonly ScrollItem[] | undefined,
	loadEarlier?: () => void,
	selfId?: string | undefined,
) {
	const bottom = useRef<HTMLDivElement>(null);
	const follow = useRef(true);
	const pendingScrollTop = useRef<number | null>(null);
	const previous = useRef<{
		conversationId: string | null;
		first: string;
		last: string;
		height: number;
		scrollTop: number;
		firstOffset: number | undefined;
	} | null>(null);
	const [away, setAway] = useState(false);
	const [newCount, setNewCount] = useState(0);
	const [atLatest, setAtLatest] = useState(false);
	const [endVisible, setEndVisible] = useState(typeof IntersectionObserver === "undefined");
	const hasItems = Boolean(items?.length);
	const viewport = useCallback(() => bottom.current?.closest<HTMLElement>(".overflow-y-auto"), []);
	const offsetOfMessage = useCallback((scroll: HTMLElement, id: string) => {
		if (!globalThis.CSS?.escape) return undefined;
		const message = bottom.current?.parentElement?.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
		return message
			? message.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop
			: undefined;
	}, []);
	const canReadLatest = useCallback(() => {
		const scroll = viewport();
		return Boolean(
			scroll && isAtEnd(scroll, READ_END_DISTANCE) && !scroll.closest("[inert], [hidden], [aria-hidden=true]"),
		);
	}, [viewport]);
	const measure = useCallback((scroll: HTMLElement) => {
		setAtLatest(isAtEnd(scroll));
		setAway(isLatestAway(scroll));
	}, []);
	const scrollToEnd = useCallback((scroll: HTMLElement) => {
		scroll.scrollTop = scroll.scrollHeight;
		// WebKit applies a scrollTop against the range it had, so a jump made in the same frame as a
		// layout change can land short. The next frame settles it, unless the reader took over first.
		const top = scroll.scrollTop;
		pendingScrollTop.current = top;
		requestAnimationFrame(() => {
			if (!follow.current) return;
			if (!isAtEnd(scroll)) scroll.scrollTop = scroll.scrollHeight;
			pendingScrollTop.current = scroll.scrollTop;
		});
	}, []);
	const jumpToLatest = useCallback(() => {
		const scroll = viewport();
		if (!scroll) return;
		scrollToEnd(scroll);
		follow.current = true;
		setNewCount(0);
		measure(scroll);
	}, [measure, scrollToEnd, viewport]);

	useLayoutEffect(() => {
		if (!conversationId || !hasItems) return;
		const scroll = viewport();
		if (!scroll) return;
		follow.current = true;
		pendingScrollTop.current = null;
		previous.current = null;
		setAway(false);
		setNewCount(0);
		const onScroll = () => {
			const top = scroll.scrollTop;
			if (previous.current) previous.current.scrollTop = top;
			// A jump's event can arrive after the dock has already changed the scroll range.
			if (top !== pendingScrollTop.current) {
				follow.current = isAtEnd(scroll);
				// Coming back to the end by hand reads everything that arrived while away.
				if (follow.current) setNewCount(0);
			}
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
			if (previous.current) {
				previous.current.height = scroll.scrollHeight;
				previous.current.firstOffset = offsetOfMessage(scroll, previous.current.first);
			}
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
	}, [conversationId, hasItems, measure, offsetOfMessage, scrollToEnd, viewport]);

	useLayoutEffect(() => {
		const scroll = viewport();
		if (!scroll || !items?.length) return;
		const old = previous.current;
		const first = items[0]?.id ?? "";
		const last = items[items.length - 1]?.id ?? "";
		const lastItem = items[items.length - 1];
		// The reader's own message is always theirs to see: bring the end into view even if they were
		// reading history above it, the way every chat app does when you send. An optimistic message
		// being replaced by the server's copy is the same message, not another one.
		const own = old?.last !== last && isOwnMessage(lastItem, selfId, old?.last);
		if (follow.current || own) {
			follow.current = true;
			scrollToEnd(scroll);
			setNewCount(0);
		} else if (old?.conversationId === conversationId && old.first !== first) {
			// Anchor to the old first message so a simultaneous live reply below it doesn't count.
			const currentOffset = offsetOfMessage(scroll, old.first);
			if (old.firstOffset !== undefined && currentOffset !== undefined) {
				scroll.scrollTop = old.scrollTop + currentOffset - old.firstOffset;
			} else if (old.last === last) {
				scroll.scrollTop += scroll.scrollHeight - old.height;
			}
			if (old.last !== last) setNewCount((count) => count + appendedSince(items, old.last));
		} else if (old?.conversationId === conversationId && old.last !== last) {
			setNewCount((count) => count + appendedSince(items, old.last));
		}
		measure(scroll);
		previous.current = {
			conversationId,
			first,
			last,
			height: scroll.scrollHeight,
			scrollTop: scroll.scrollTop,
			firstOffset: offsetOfMessage(scroll, first),
		};
	}, [conversationId, items, measure, offsetOfMessage, scrollToEnd, selfId, viewport]);

	useLayoutEffect(() => {
		const scroll = viewport();
		if (!conversationId || !hasItems || !loadEarlier || !scroll) return;
		const loadAtTop = () => {
			if (scroll.clientHeight > 0 && scroll.scrollTop <= 2 && !scroll.closest("[inert], [hidden], [aria-hidden=true]"))
				loadEarlier();
		};
		scroll.addEventListener("scroll", loadAtTop, { passive: true });
		// A short page can leave the viewport at the top without a scroll event.
		loadAtTop();
		return () => scroll.removeEventListener("scroll", loadAtTop);
	}, [conversationId, hasItems, loadEarlier, viewport]);

	return {
		bottom,
		showLatest: away || newCount > 0,
		newCount,
		atBottom: atLatest,
		atLatest: atLatest && endVisible,
		canReadLatest,
		jumpToLatest,
	};
}
