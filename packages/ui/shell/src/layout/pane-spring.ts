/** Exact unit-mass spring step: stiffness 1200, damping 80 (roots −20 and −60). */
export function stepPaneSpring(position: number, velocity: number, target: number, seconds: number) {
	const offset = position - target;
	const slow = (velocity + 60 * offset) / 40;
	const fast = offset - slow;
	const slowDecay = slow * Math.exp(-20 * seconds);
	const fastDecay = fast * Math.exp(-60 * seconds);
	return { position: target + slowDecay + fastDecay, velocity: -20 * slowDecay - 60 * fastDecay };
}
