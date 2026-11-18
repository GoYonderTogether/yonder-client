/**
 * `@yonder/ui-tokens` — layer 1. CSS custom properties and the plain TypeScript constants that
 * describe them. No components live here.
 */

export type { ContentWidth, IconSize } from "./scale.ts";
export { CONTENT_WIDTH, ICON_SIZE, ICON_STROKE, SPRING } from "./scale.ts";
export type { ResolvedTheme, StyleChoice, ThemeChoice } from "./theme.ts";
export { isStyleChoice, isThemeChoice, resolveTheme, STYLE_CHOICES, THEME_CHOICES } from "./theme.ts";
