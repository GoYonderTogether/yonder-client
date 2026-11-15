import Taro from "@tarojs/taro";
import { useSyncExternalStore } from "react";

export type Locale = "zh-CN" | "en";
let locale: Locale =
	Taro.getStorageSync("yonder.mini.locale") || (Taro.getSystemInfoSync().language.startsWith("zh") ? "zh-CN" : "en");
const listeners = new Set<() => void>();

export function t(zh: string, en: string): string {
	return locale === "zh-CN" ? zh : en;
}
export function setLocale(value: Locale): void {
	locale = value;
	Taro.setStorageSync("yonder.mini.locale", value);
	for (const listener of [...listeners]) listener();
}
export function useLocale() {
	const value = useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => locale,
	);
	return { locale: value, setLocale };
}
