/**
 * Appearance and language, as user choices. Stored locally so the first paint is right before any
 * request (02 第十二节), and mirrored to the account so another device agrees.
 */

import type { Locale } from "@yonder/ui-i18n";
import { isLocale, resolveLocale } from "@yonder/ui-i18n";
import type { StyleChoice, ThemeChoice, UISizeChoice } from "@yonder/ui-tokens";
import { DEFAULT_UI_SIZE, isStyleChoice, isThemeChoice, isUISizeChoice, resolveTheme } from "@yonder/ui-tokens";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSessionStore } from "../auth/session-store.ts";
import { useData } from "../query/provider.tsx";
import type { Storage } from "../storage/index.ts";
import { useAccountPreferences, useSavePreferences } from "./account-preferences.ts";
import { notifyPreferences, usePreferencesVersion } from "./store.ts";

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
 * that changing the language in 「通用」 updates that screen and nothing else. The listener set and
 * version are shared with the account preferences, so one write wakes every reader.
 */
const notify = notifyPreferences;

/** A value derived from storage, recomputed when any preference is written. */
function usePreference<T>(storage: Storage, read: (storage: Pick<Storage, "get">) => T): T {
	const version = usePreferencesVersion();
	// biome-ignore lint/correctness/useExhaustiveDependencies: `version` is the change signal; the read function is stable in meaning.
	return useMemo(() => read(storage), [storage, version]);
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

/**
 * The language the app speaks: the account's resolved `me.locale` once signed in, this device's
 * before that. `setLocale` follows the same rule — signed in, the pick locks the account (a person
 * choosing English wants English on their other devices too), through the same save adapter as
 * 「通用」, so a refusal is reported rather than silently undone; signed out, there is no account to
 * hold it, so it is this device's own choice, which is what the landing and sign-in screens have
 * always meant by their language button.
 */
export function useLocalePreference(): LocaleControl {
	const { storage } = useData();
	const status = useSessionStore((state) => state.status);
	const { localeValue } = useAccountPreferences();
	const save = useSavePreferences();
	const locale = localeValue;

	useEffect(() => {
		document.documentElement.lang = locale;
	}, [locale]);

	const setLocale = useCallback(
		(next: Locale) => {
			if (status === "signed-in") {
				void save.save({ locale: { mode: "manual", value: next } });
				return;
			}
			// No account yet: remember it on this device, and make it the first paint's language.
			storage.set("locale", next);
			storage.set("locale-mode", "manual");
			notify();
		},
		[save, status, storage],
	);

	return { locale, setLocale };
}
