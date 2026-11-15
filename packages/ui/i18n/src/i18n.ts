/**
 * Creating the i18next instance, and the language decision. Language detection order is the one in
 * 05-前端架构和技术栈 第七节: the user's stored choice → the system language → English.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en.ts";
import { zhCN } from "./locales/zh-CN.ts";

export type Locale = "zh-CN" | "en";
export const LOCALES: readonly Locale[] = ["zh-CN", "en"];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
	return value === "zh-CN" || value === "en";
}

/** `zh`, `zh-CN`, `zh-Hans-CN` all mean Chinese; everything else means English. */
export function resolveLocale(input: string | null | undefined): Locale {
	if (!input) return DEFAULT_LOCALE;
	const normalised = input.trim().toLowerCase();
	if (normalised === "zh" || normalised.startsWith("zh-") || normalised.startsWith("zh_")) return "zh-CN";
	return "en";
}

/** The `<html lang>` value, which is what CSS `:lang()` and screen readers use. */
export function htmlLang(locale: Locale): string {
	return locale;
}

export const resources = {
	en: { translation: en },
	"zh-CN": { translation: zhCN },
} as const;

export type I18n = typeof i18n;

export function createI18n(locale: Locale): I18n {
	const instance = i18n.createInstance();
	void instance.use(initReactI18next).init({
		resources,
		lng: locale,
		fallbackLng: DEFAULT_LOCALE,
		interpolation: { escapeValue: false },
		returnNull: false,
		// A missing key is reported rather than rendered as a silent empty label.
		saveMissing: false,
		missingKeyHandler: (_languages, _namespace, key) => console.warn(`[i18n] missing key: ${key}`),
	});
	return instance;
}
