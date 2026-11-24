/**
 * The back gesture's rules, shared by every layer that slides away under a finger: the edge band a
 * gesture may start in, how much sideways travel arms it, how release speed is read, and when a
 * released layer closes. Kept out of the component so the numbers can be proven without a browser.
 *
 * The shape follows the system's interactive pop (UIKit's percent-driven interactive transition):
 * a released page closes on a flick wherever it is, a finger coming back never closes it, and
 * otherwise where it would coast to decides. Both distance and speed are signed toward closing, so
 * a layer that leaves toward the left (「我」) arrives here as the same positive numbers.
 */

/** A gesture may only start inside this band at the layer's closing edge. */
export const EDGE_WIDTH = 24;
/** Sideways travel before the gesture takes the pointer; a tap or a vertical scroll stays what it is. */
export const SLOP = 8;
/** Arming also needs the sideways travel to outweigh the vertical one by this much. */
export const SLOP_RATIO = 1.5;
/** px/s toward closing that counts as a flick from any distance. */
export const FLICK_SPEED = 220;
/** A flick must also have travelled this far; arming alone is not a flick. */
const FLICK_DISTANCE = 16;
/** A finger that has not reported for this long is at rest, whatever its last sample said. */
const REST_AFTER_MS = 60;
/** Samples older than this no longer describe how the finger is moving. */
const WINDOW_MS = 120;
/** Seconds of coasting at the release speed a released layer is given. */
const COAST_S = 0.18;

/** How far a layer must be dragged, however slowly, to close: a quarter of it, never less than 64px. */
export function closeDistance(size: number): number {
	return Math.max(64, size / 4);
}

export interface Sample {
	time: number;
	point: number;
}

/** Adds a sample in place and drops the ones too old to describe the finger, keeping one before them. */
export function track(samples: Sample[], sample: Sample): Sample[] {
	samples.push(sample);
	while (samples.length > 2 && (samples[1]?.time ?? sample.time) < sample.time - WINDOW_MS) samples.shift();
	return samples;
}

/**
 * Signed px/s along the drag axis over the last moments before `now`. Measured over a window rather
 * than between the last two moves: a slow finger reports single-pixel steps, and one such step says
 * nothing about how it was thrown. A finger that has stopped reporting is at rest.
 */
export function releaseVelocity(samples: readonly Sample[], now: number): number {
	const last = samples.at(-1);
	if (!last || now - last.time > REST_AFTER_MS) return 0;
	const first = samples.find((sample) => last.time - sample.time <= WINDOW_MS);
	if (!first || last.time - first.time < 8) return 0;
	return ((last.point - first.point) / (last.time - first.time)) * 1000;
}

/** Whether a released layer closes. */
export function releasedToClose({
	distance,
	speed,
	closeThreshold,
}: {
	distance: number;
	speed: number;
	closeThreshold: number;
}): boolean {
	if (distance <= 0) return false;
	if (speed <= -FLICK_SPEED) return false;
	if (speed >= FLICK_SPEED) return distance >= FLICK_DISTANCE;
	return distance + Math.max(0, speed) * COAST_S >= closeThreshold;
}
