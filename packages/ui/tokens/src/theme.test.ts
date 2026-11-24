import { describe, expect, test } from "vitest";
import {
	DEFAULT_UI_SIZE,
	isStyleChoice,
	isThemeChoice,
	isUISizeChoice,
	resolveTheme,
	THEME_CHOICES,
	UI_SIZE_CHOICES,
} from "./theme.ts";

describe("theme", () => {
	test("system follows the operating system", () => {
		expect(resolveTheme("system", true)).toBe("dark");
		expect(resolveTheme("system", false)).toBe("light");
	});

	test("an explicit choice wins over the system", () => {
		expect(resolveTheme("light", true)).toBe("light");
		expect(resolveTheme("dark", false)).toBe("dark");
	});

	test("only the three documented choices are valid", () => {
		expect(THEME_CHOICES).toEqual(["system", "light", "dark"]);
		expect(isThemeChoice("system")).toBe(true);
		expect(isThemeChoice("sepia")).toBe(false);
		expect(isThemeChoice(null)).toBe(false);
	});

	test("interface size has five levels and defaults to the middle one", () => {
		expect(UI_SIZE_CHOICES).toEqual(["xsmall", "small", "medium", "large", "xlarge"]);
		expect(DEFAULT_UI_SIZE).toBe("medium");
		expect(UI_SIZE_CHOICES).toContain(DEFAULT_UI_SIZE);
		expect(isUISizeChoice("large")).toBe(true);
		expect(isUISizeChoice("huge")).toBe(false);
		expect(isUISizeChoice(undefined)).toBe(false);
		expect(isStyleChoice("glow")).toBe(true);
	});
});
