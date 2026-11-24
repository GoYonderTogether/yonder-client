/**
 * The theme decision, as data. The DOM attribute is set from these values by the app shell; the
 * tokens package owns the vocabulary so nothing invents a fourth option.
 */
export type ThemeChoice = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type StyleChoice = "classic" | "glow";
/** 通用 · 界面大小: one multiplier for type, spacing, controls and the phone's floating chrome. */
export type UISizeChoice = "xsmall" | "small" | "medium" | "large" | "xlarge";

export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];
export const STYLE_CHOICES: readonly StyleChoice[] = ["classic", "glow"];
export const UI_SIZE_CHOICES: readonly UISizeChoice[] = ["xsmall", "small", "medium", "large", "xlarge"];
/** The stored default, and the level a person gets before choosing: 10% above the old sizes. */
export const DEFAULT_UI_SIZE: UISizeChoice = "medium";

export function isStyleChoice(value: unknown): value is StyleChoice {
	return value === "classic" || value === "glow";
}

export function isUISizeChoice(value: unknown): value is UISizeChoice {
	return value === "xsmall" || value === "small" || value === "medium" || value === "large" || value === "xlarge";
}

export function isThemeChoice(value: unknown): value is ThemeChoice {
	return value === "system" || value === "light" || value === "dark";
}

/** What a choice means right now, given whether the system prefers dark. */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
	if (choice === "light" || choice === "dark") return choice;
	return systemPrefersDark ? "dark" : "light";
}
