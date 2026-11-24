/**
 * Appearance and language, as user choices. Stored locally so the first paint is right before any
 * request (02 第十二节), and mirrored to the account so another device agrees.
 */

import type { Locale } from "@yonder/ui-i18n";
import { isLocale, resolveLocale } from "@yonder/ui-i18n";
import type { StyleChoice, ThemeChoice, UISizeChoice } from "@yonder/ui-tokens";
import { DEFAULT_UI_SIZE, isStyleChoice, isThemeChoice, isUISizeChoice, resolveTheme } from "@yonder/ui-tokens";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useData } from "../query/provider.tsx";
import type { Storage } from "../storage/index.ts";

/** The system preference, watched live. */
export function useSystemPrefersDark(): boolean {
	const [dark, setDark] = useState(() =>
		typeof globalThis.matchMedia === "function" ? globalThis.matchMedia("(prefers-color-scheme: dark)").matches : false,
	);

	useEffect(() => {
		if (typeof globalThis.matchMedia !== "function") return;
		const query = globalThis.matchMedia("(prefers-color-scheme: dark)");
		const handler = (event: MediaQueryListEvent) => setDark(event.matches);
		query.addEventListener("change", handler);
		setDark(query.matches);
		return () => query.removeEventListener("change", handler);
	}, []);

	return dark;
}

export interface ThemeControl {
	choice: ThemeChoice;
	resolved: "light" | "dark";
	setChoice: (choice: ThemeChoice) => void;
	style: StyleChoice;
	setStyle: (style: StyleChoice) => void;
	size: UISizeChoice;
	setSize: (size: UISizeChoice) => void;
}

/*
 * Keys inside the app's storage, which namespaces them itself (`yonder.` + key). The first-paint
 * script in index.html reads the resulting `yonder.theme` / `yonder.locale` directly.
 */
const THEME_KEY = "theme";
const LOCALE_KEY = "locale";
const STYLE_KEY = "style";
const UI_SIZE_KEY = "ui-size";

/** Read the stored choice; the inline first-paint script reads the same key. */
export function readThemeChoice(storage: Pick<Storage, "get">): ThemeChoice {
	const stored = storage.get(THEME_KEY);
	return isThemeChoice(stored) ? stored : "system";
}

export function readStyleChoice(storage: Pick<Storage, "get">): StyleChoice {
	const stored = storage.get(STYLE_KEY);
	return isStyleChoice(stored) ? stored : "classic";
}

/** The interface size, defaulting to `medium` — the same level `tokens.css` assumes without a choice. */
export function readUISizeChoice(storage: Pick<Storage, "get">): UISizeChoice {
	const stored = storage.get(UI_SIZE_KEY);
	return isUISizeChoice(stored) ? stored : DEFAULT_UI_SIZE;
}

export function readLocale(storage: Pick<Storage, "get">): Locale {
	const stored = storage.get(LOCALE_KEY);
	if (isLocale(stored)) return stored;
	return resolveLocale(globalThis.navigator?.language);
}

/*
 * One value per storage, shared by every component that asks. A component-local copy would mean
 * that changing the language in 「通用」 updates that screen and nothing else.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
const subscribe = (listener: Listener) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};
const notify = () => {
	for (const listener of listeners) listener();
};

function usePreference<T>(storage: Storage, read: (storage: Pick<Storage, "get">) => T): T {
	return useSyncExternalStore(
		subscribe,
		() => read(storage),
		() => read(storage),
	);
}

/**
 * The theme and the interface size. Applying them means writing `data-theme`, `data-style` and
 * `data-ui-size` on `<html>` and nothing else, so no component needs to know a choice changed.
 */
export function useTheme(): ThemeControl {
	const { storage } = useData();
	const prefersDark = useSystemPrefersDark();
	const choice = usePreference(storage, readThemeChoice);
	const resolved = resolveTheme(choice, prefersDark);
	const style = usePreference(storage, readStyleChoice);
	const size = usePreference(storage, readUISizeChoice);

	useEffect(() => {
		document.documentElement.dataset.theme = resolved;
		document.documentElement.dataset.style = style;
		document.documentElement.dataset.uiSize = size;
	}, [resolved, style, size]);

	const setChoice = useCallback(
		(next: ThemeChoice) => {
			storage.set(THEME_KEY, next);
			notify();
		},
		[storage],
	);

	const setStyle = useCallback(
		(next: StyleChoice) => {
			storage.set(STYLE_KEY, next);
			notify();
		},
		[storage],
	);

	const setSize = useCallback(
		(next: UISizeChoice) => {
			storage.set(UI_SIZE_KEY, next);
			notify();
		},
		[storage],
	);

	return { choice, resolved, setChoice, style, setStyle, size, setSize };
}

export interface LocaleControl {
	locale: Locale;
	setLocale: (locale: Locale) => void;
}

export function useLocalePreference(): LocaleControl {
	const { storage } = useData();
	const locale = usePreference(storage, readLocale);

	useEffect(() => {
		document.documentElement.lang = locale;
	}, [locale]);

	const setLocale = useCallback(
		(next: Locale) => {
			storage.set(LOCALE_KEY, next);
			notify();
		},
		[storage],
	);

	return { locale, setLocale };
}
