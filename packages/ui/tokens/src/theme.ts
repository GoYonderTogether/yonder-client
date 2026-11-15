/**
 * The theme decision, as data. The DOM attribute is set from these values by the app shell; the
 * tokens package owns the vocabulary so nothing invents a fourth option.
 */
export type ThemeChoice = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

export function isThemeChoice(value: unknown): value is ThemeChoice {
	return value === "system" || value === "light" || value === "dark";
}

/** What a choice means right now, given whether the system prefers dark. */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
	if (choice === "light" || choice === "dark") return choice;
	return systemPrefersDark ? "dark" : "light";
}
