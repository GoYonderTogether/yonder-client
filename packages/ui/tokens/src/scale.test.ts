import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CONTENT_WIDTH, ICON_SIZE, ICON_STROKE, iconPixels, SPRING } from "./scale.ts";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const motion = readFileSync(new URL("./motion.css", import.meta.url), "utf8");

function token(name: string): string {
	const match = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
	if (!match?.[1]) throw new Error(`${name} is not defined in tokens.css`);
	return match[1].trim();
}

/**
 * A scaled length is `calc(<base>px * var(--ui-scale))`; the number in `scale.ts` is the base the
 * level multiplies. This reads that base, so a drifted number still fails the test.
 */
function basePixels(value: string): number {
	const match = /^calc\((\d+(?:\.\d+)?)px \* var\(--ui-scale\)\)$/.exec(value) ?? /^(\d+(?:\.\d+)?)px$/.exec(value);
	if (!match?.[1]) throw new Error(`expected a px base or a scaled length, got ${value}`);
	return Number(match[1]);
}

describe("scale.ts mirrors tokens.css", () => {
	test("icon sizes and strokes", () => {
		for (const [size, value] of Object.entries(ICON_SIZE)) expect(basePixels(token(`--icon-${size}`))).toBe(value);
		expect(Number(token("--icon-stroke"))).toBe(ICON_STROKE.normal);
		expect(Number(token("--icon-stroke-selected"))).toBe(ICON_STROKE.selected);
	});

	test("a scaled icon size is the base rounded to whole pixels", () => {
		expect(iconPixels("sm")).toBe(16);
		expect(iconPixels("md", 1.1)).toBe(22);
		expect(iconPixels("lg", 0.85)).toBe(20);
	});

	test("content widths", () => {
		for (const [width, value] of Object.entries(CONTENT_WIDTH)) expect(token(`--width-${width}`)).toBe(`${value}px`);
	});

	test("springs", () => {
		for (const [name, spring] of Object.entries(SPRING)) {
			expect(Number(token(`--spring-${name}-stiffness`))).toBe(spring.stiffness);
			expect(Number(token(`--spring-${name}-damping`))).toBe(spring.damping);
		}
	});

	test("layers stack in the documented order", () => {
		const layers = ["sticky", "dock", "popover", "overlay", "toast"].map((layer) => Number(token(`--z-${layer}`)));
		expect(layers).toEqual([...layers].sort((left, right) => left - right));
	});

	test("reduced motion zeroes every duration, the slower one included", () => {
		const reduced = motion.slice(motion.indexOf("prefers-reduced-motion"));
		for (const duration of ["fast", "base", "slow", "slower"]) {
			expect(reduced).toContain(`--duration-${duration}: 0ms;`);
		}
	});
});
