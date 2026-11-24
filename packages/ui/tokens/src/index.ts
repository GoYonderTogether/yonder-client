/**
 * `@yonder/ui-tokens` — layer 1. CSS custom properties and the plain TypeScript constants that
 * describe them. No components live here.
 */

export type { ContentWidth, IconSize } from "./scale.ts";
export { CONTENT_WIDTH, ICON_SIZE, ICON_STROKE, iconPixels, SPRING } from "./scale.ts";
export type { ResolvedTheme, StyleChoice, ThemeChoice, UISizeChoice } from "./theme.ts";
export {
	DEFAULT_UI_SIZE,
	isStyleChoice,
	isThemeChoice,
	isUISizeChoice,
	resolveTheme,
	STYLE_CHOICES,
	THEME_CHOICES,
	UI_SIZE_CHOICES,
} from "./theme.ts";
