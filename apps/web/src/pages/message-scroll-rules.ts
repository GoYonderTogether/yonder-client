/**
 * The rules the message list follows, as pure functions so the browser behaviour is decided in one
 * place: a reader at the end follows new messages, a reader above it keeps the position they chose,
 * and the reader's own message always goes to the end.
 */
export const STICK_DISTANCE = 48;
/** How far the reader has to leave the end before 「回到最新」 appears. */
export const LATEST_DISTANCE = 120;

export type ScrollMetrics = { scrollHeight: number; clientHeight: number; scrollTop: number };
export type ScrollItem = { id: string; senderId?: string | undefined };

export function distanceToEnd({ scrollHeight, clientHeight, scrollTop }: ScrollMetrics) {
	return scrollHeight - clientHeight - scrollTop;
}

/** Reading the newest message means the very end, not merely the stick area around it. */
export const READ_END_DISTANCE = 2;

/**
 * The end counts as reached within about one line of it. Images that load late, fractional layout
 * and the overscroll of a phone move the end by a few pixels without the reader leaving it.
 */
export function isAtEnd(metrics: ScrollMetrics, tolerance = STICK_DISTANCE) {
	// scrollTop can be fractional while the scroll dimensions are rounded.
	return metrics.clientHeight > 0 && distanceToEnd(metrics) <= tolerance;
}

export function isLatestAway(metrics: ScrollMetrics) {
	return distanceToEnd(metrics) > LATEST_DISTANCE;
}

/** An optimistic message is the id `useSendMessage` gives a send from this tab before the server answers. */
const OPTIMISTIC_PREFIX = "temp_";

/**
 * A message is the reader's own when this tab sent it: an optimistic one always is, and a saved one
 * when its sender is the signed-in person. The id alone is enough before `/v1/me` has answered.
 * Replacing the optimistic copy with the server's is the same send again, so `previousLast` vetoes it.
 */
export function isOwnMessage(item: ScrollItem | undefined, selfId: string | undefined, previousLast?: string) {
	if (!item) return false;
	const replaced = Boolean(previousLast?.startsWith(OPTIMISTIC_PREFIX)) && !item.id.startsWith(OPTIMISTIC_PREFIX);
	return !replaced && (item.id.startsWith(OPTIMISTIC_PREFIX) || Boolean(selfId && item.senderId === selfId));
}

/** How many messages were appended after the last one the reader had already seen. */
export function appendedSince(items: readonly ScrollItem[], lastSeenId: string) {
	if (!lastSeenId) return items.length;
	const index = items.findLastIndex((item) => item.id === lastSeenId);
	return index < 0 ? 0 : items.length - index - 1;
}
