/**
 * `@yonder/ui-i18n` — the language tables and the i18next instance. Layer 1.5: every layer above
 * tokens may read text, so this sits beside tokens rather than inside a feature.
 */

export type { I18n, Locale } from "./i18n.ts";
export {
	createI18n,
	DEFAULT_LOCALE,
	htmlLang,
	isLocale,
	LOCALES,
	resolveLocale,
	resources,
} from "./i18n.ts";
export type { Messages } from "./locales/en.ts";
export { en } from "./locales/en.ts";
export { zhCN } from "./locales/zh-CN.ts";
