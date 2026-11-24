/**
 * The page a sliding layer reveals while it is dragged, and how far it is held aside. This is the
 * system's page push: the page below is pushed a short way the other way and stays there while the
 * next page covers it, so a back gesture looks like a page lifting off a page rather than a card
 * appearing over a frozen screen.
 *
 * Found through the DOM because the layers are built by three different shells (the frame's detail
 * page, the right-hand panel stack, the 「我」 stack) and none of them owns its neighbour: the page
 * below is the nearest earlier sibling surface that is actually on screen.
 */

/** How much of a layer's width the page below is held aside, at full cover. */
export const RECEDE = 0.28;

/**
 * The surface under `element`: the nearest element before it — or before an ancestor of it — that
 * is painted on screen. A page below a stacked page is inert, which is why inert elements are not
 * skipped; a page that is hidden, collapsed or already gone is, so a stack reveals the page below
 * the departing one rather than a ghost of it.
 */
export function pageBelow(element: HTMLElement): HTMLElement | null {
	for (let node: HTMLElement | null = element; node && node !== document.body; node = node.parentElement) {
		for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
			if (!(sibling instanceof HTMLElement)) continue;
			if (sibling === element) continue;
			const bounds = sibling.getBoundingClientRect();
			if (bounds.width < 1 || bounds.height < 1) continue;
			const style = getComputedStyle(sibling);
			if (style.visibility === "hidden" || style.display === "none") continue;
			return sibling;
		}
		// Once past the layer itself, the walk may leave its own subtree but not the stack it sits in.
		if (node !== element && node.matches("[data-page-layer]")) break;
	}
	return null;
}

/** Whether the frame is laid out for a phone or a narrow window, where a push covers the page below. */
export function coversPageBelow(element: HTMLElement): boolean {
	const mode = element.closest<HTMLElement>("[data-layout-mode]")?.dataset.layoutMode;
	return mode === "mobile" || mode === "compact";
}

/**
 * Holds the page below aside for a layer `progress` of the way on screen (1 covers it, 0 gone),
 * moving it toward the side the layer came from. Written straight to the node: a drag updates it on
 * every move, and one spring keeps updating it through the settle and the exit.
 */
export function recede(element: HTMLElement | null, progress: number, size: number, from: 1 | -1) {
	// `from` is the closing side of the layer that is leaving; the page below moves the same way it
	// did when that page was pushed in, which for either edge is one share of the width. The return
	// distance is the layer's own, so the push is the same on both edges.
	if (!element) return;
	const cover = Math.min(1, Math.max(0, progress));
	// At rest the page is left exactly as it was: no transform is left behind on a page that holds
	// fixed or sticky content of its own (the chat's composer and headers).
	if (cover <= 0.001) {
		clearRecede(element);
		return;
	}
	element.style.transform = `translateX(${from * size * RECEDE * cover}px)`;
	element.style.willChange = "transform";
}

/** Returns the page below to its place, with no transform left behind. */
export function clearRecede(element: HTMLElement | null) {
	if (!element) return;
	element.style.removeProperty("transform");
	element.style.removeProperty("will-change");
}
