import { describe, expect, test } from "vitest";
import { isThemeChoice, resolveTheme, THEME_CHOICES } from "./theme.ts";

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
});
