import { SPRING } from "@yonder/ui-tokens";

const { stiffness, damping } = SPRING.pane;
// Overdamped (damping² > 4·stiffness): two real roots, so a released divider never overshoots.
// With the token's 1200 / 80 they are −20 (slow) and −60 (fast).
const spread = Math.sqrt(damping * damping - 4 * stiffness);
const SLOW = (-damping + spread) / 2;
const FAST = (-damping - spread) / 2;

/** Exact unit-mass spring step for `SPRING.pane` (`--spring-pane-*`). */
export function stepPaneSpring(position: number, velocity: number, target: number, seconds: number) {
	const offset = position - target;
	const slow = (velocity - FAST * offset) / (SLOW - FAST);
	const fast = offset - slow;
	const slowDecay = slow * Math.exp(SLOW * seconds);
	const fastDecay = fast * Math.exp(FAST * seconds);
	return { position: target + slowDecay + fastDecay, velocity: SLOW * slowDecay + FAST * fastDecay };
}
