import { describe, expect, test } from "vitest";
import { defaultsFor, familyOf } from "./provider-model-defaults.ts";

/**
 * The defaults a discovered model arrives with. They follow CC Switch's model-mapping table: the
 * family the id names supplies the window and the levels, and anything the endpoint declared wins.
 */
describe("model family defaults", () => {
	test("a Claude 5 model starts at its published window with four levels", () => {
		expect(defaultsFor("claude-opus-5-5", undefined)).toEqual({
			contextLength: 1_000_000,
			efforts: ["low", "medium", "high", "max"],
		});
		// A dated snapshot is the same family.
		expect(familyOf("claude-sonnet-4-5-20250929")?.label).toBe("Claude 4");
	});

	test("a family with a stop-thinking switch declares off; one without does not", () => {
		expect(defaultsFor("deepseek-v4.1-flash", undefined).efforts).toEqual(["off", "low", "medium", "high"]);
		// Anthropic has no stop-thinking switch, so `off` would be a level it cannot honour.
		expect(defaultsFor("claude-opus-5-5", undefined).efforts).not.toContain("off");
	});

	test("what the endpoint declared wins over the family", () => {
		const declared = { contextLength: 128_000, efforts: ["low"] as string[] };
		expect(defaultsFor("deepseek-v4.1-flash", declared)).toEqual({
			contextLength: 128_000,
			efforts: ["low"],
		});
	});

	test("an unknown model gets no invented window and no invented levels", () => {
		expect(defaultsFor("some-company/internal-model-v2", undefined)).toEqual({});
	});

	test("every declared level is one the host can rank", () => {
		const levels = defaultsFor("gemini-3-pro", undefined).efforts ?? [];
		for (const level of levels) expect(["off", "low", "medium", "high", "max"]).toContain(level);
	});
});
