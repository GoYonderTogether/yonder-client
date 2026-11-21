/**
 * How a dragged layer decides on release. While a finger is down the layer is exactly where the
 * finger puts it; only the moment of letting go decides between closing and settling back, and it
 * reads what the finger was doing then, not what it did a moment earlier.
 */

/** px/s along the closing axis that counts as a deliberate flick either way. */
export const FLING_SPEED = 300;
/** A finger that has not reported for this long is at rest, whatever its last sample said. */
const REST_AFTER_MS = 50;
/** Samples older than this no longer describe how the finger is moving. */
const WINDOW_MS = 100;

export interface DragSample {
	time: number;
	point: number;
}

/** Past this distance, letting go closes: a quarter of the layer, never less than 64px. */
export function closeDistance(size: number): number {
	return Math.max(64, size * 0.25);
}

/** Signed px/s of the finger along the drag axis over the last moments before `now`; 0 at rest. */
export function releaseVelocity(samples: readonly DragSample[], now: number): number {
	const last = samples.at(-1);
	if (!last || now - last.time > REST_AFTER_MS) return 0;
	const first = samples.find((sample) => last.time - sample.time <= WINDOW_MS);
	if (!first || last.time - first.time < 8) return 0;
	return ((last.point - first.point) / (last.time - first.time)) * 1000;
}

/**
 * `offset` is how far the layer has been dragged toward closing; `speed` the finger's px/s toward
 * closing (negative means it is coming back). A slow drag closes past the distance, a flick closes
 * from a short way in, and a finger that is returning keeps the layer open.
 */
export function shouldDismiss(offset: number, speed: number, size: number): boolean {
	if (offset <= 0) return false;
	if (speed <= -FLING_SPEED) return false;
	if (speed >= FLING_SPEED) return offset >= 16;
	return offset >= closeDistance(size);
}
