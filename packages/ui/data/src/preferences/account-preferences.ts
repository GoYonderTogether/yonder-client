/**
 * The account's time zone and language, as the person chose them — and the one seam that later
 * carries the same choice to the server.
 *
 * Two shapes, one per setting (Google and Apple account settings do the same):
 *   - `auto`   — follow this device: its zone, its language. Nothing is locked.
 *   - `manual` — a zone name, a language tag. Locked, and what every device of the account shows.
 *
 * Stage 1 (this file): the choice is kept in local storage. `useSavePreferences` is the adapter the
 * settings page saves through; when the server's `PATCH /v1/me/preferences` lands, only that hook's
 * body changes — the page, the row and the copy stay as they are.
 */

import type { Locale } from "@yonder/ui-i18n";
import { isLocale, resolveLocale } from "@yonder/ui-i18n";
import { canonicalTimeZone, deviceTimeZone } from "@yonder/ui-time";
import { useCallback, useMemo, useState } from "react";
import { useDataOrNull } from "../query/provider.tsx";
import type { Storage } from "../storage/index.ts";
import { notifyPreferences, usePreferencesVersion } from "./store.ts";

/** `auto` follows this device; `manual` locks the account to one value. */
export type PreferenceMode = "auto" | "manual";

export interface TimeZonePreference {
	mode: PreferenceMode;
	/** The locked IANA zone, or `null` in `auto`. Never a bare offset: offsets cannot express DST. */
	zone: string | null;
}

export interface LocalePreference {
	mode: PreferenceMode;
	/** The locked language, or `null` in `auto`. */
	locale: Locale | null;
}

/*
 * Stored under the app's own namespace (`yonder.` is added by the storage adapter). The first-paint
 * script in index.html reads `yonder.locale` and `yonder.locale-mode`, so it paints in the right
 * language and never flashes another one.
 */
const TIMEZONE_KEY = "timezone";
const TIMEZONE_MODE_KEY = "timezone-mode";
const LOCALE_KEY = "locale";
const LOCALE_MODE_KEY = "locale-mode";

/** What the settings page writes; a field left out is unchanged. */
export interface PreferencesPatch {
	timezone?: TimeZonePreference;
	locale?: LocalePreference;
}

const AUTO_TIME_ZONE: TimeZonePreference = { mode: "auto", zone: null };
const AUTO_LOCALE: LocalePreference = { mode: "auto", locale: null };

export function readTimeZonePreference(storage: Pick<Storage, "get">): TimeZonePreference {
	const stored = canonicalTimeZone(storage.get(TIMEZONE_KEY));
	const mode = storage.get(TIMEZONE_MODE_KEY);
	if (mode === "manual" && stored) return { mode: "manual", zone: stored };
	return { mode: "auto", zone: null };
}

/**
 * Backward compatibility with a `yonder.locale` written before there was a mode: a stored language
 * was a deliberate choice, so it counts as manual. With no stored language the app follows the
 * device, which is what it always did.
 */
export function readLocalePreference(storage: Pick<Storage, "get">): LocalePreference {
	const stored = storage.get(LOCALE_KEY);
	const mode = storage.get(LOCALE_MODE_KEY);
	if (mode === "auto") return { mode: "auto", locale: null };
	if (mode === "manual" && isLocale(stored)) return { mode: "manual", locale: stored };
	if (isLocale(stored)) return { mode: "manual", locale: stored };
	return { mode: "auto", locale: null };
}

/** The language this device is set to, whatever the account chose. */
export function deviceLocale(): Locale {
	return resolveLocale(globalThis.navigator?.language);
}

/** The zone this device is set to, whatever the account chose. */
export function deviceZone(): string {
	return deviceTimeZone();
}

/** The zone every instant is read in: the locked one, else this device's. */
export function effectiveTimeZone(preference: TimeZonePreference, device = deviceZone()): string {
	return preference.mode === "manual" && preference.zone ? preference.zone : device;
}

/** The language every screen speaks: the locked one, else this device's. */
export function effectiveLocale(preference: LocalePreference, device = deviceLocale()): Locale {
	return preference.mode === "manual" && preference.locale ? preference.locale : device;
}

/*
 * One value per storage, shared by every screen: the settings row, every time label and the
 * language provider all read the same store, so a change on one device is seen everywhere at once.
 * The listener set and version live in `store.ts`, because the appearance preferences use them too.
 */
const notify = notifyPreferences;

function writePreference(storage: Storage, patch: PreferencesPatch): void {
	if (patch.timezone) {
		const zone = patch.timezone.mode === "manual" ? canonicalTimeZone(patch.timezone.zone) : null;
		if (patch.timezone.mode === "manual" && !zone) throw new Error("unknown-time-zone");
		if (zone) storage.set(TIMEZONE_KEY, zone);
		else storage.remove(TIMEZONE_KEY);
		storage.set(TIMEZONE_MODE_KEY, patch.timezone.mode);
	}
	if (patch.locale) {
		if (patch.locale.mode === "manual") {
			if (!patch.locale.locale) throw new Error("unknown-locale");
			storage.set(LOCALE_KEY, patch.locale.locale);
		} else {
			storage.remove(LOCALE_KEY);
		}
		storage.set(LOCALE_MODE_KEY, patch.locale.mode);
	}
	// The storage adapter swallows a refused write so the app keeps running; here that would mean
	// reporting success for a choice that was not kept. Read it back, and say so when it is gone.
	if (patch.timezone) {
		const kept = readTimeZonePreference(storage);
		const expected = patch.timezone.mode;
		if (kept.mode !== expected || (expected === "manual" && kept.zone !== canonicalTimeZone(patch.timezone.zone)))
			throw new Error("storage-refused");
	}
	if (patch.locale) {
		const kept = readLocalePreference(storage);
		const expected = patch.locale.mode;
		if (kept.mode !== expected || (expected === "manual" && kept.locale !== patch.locale.locale))
			throw new Error("storage-refused");
	}
	notify();
}

export interface AccountPreferences {
	timezone: TimeZonePreference;
	locale: LocalePreference;
	/** The zone every screen reads instants in. */
	zone: string;
	/** The language every screen speaks. */
	localeValue: Locale;
	/** What this device itself is set to, so 「跟随系统」 can say what it would follow. */
	deviceZone: string;
	deviceLocale: Locale;
}

/**
 * The account's choices, or this device's when rendered outside the app's provider (a unit test of
 * a single row). The device fallback is exactly the `auto` mode, so nothing is invented.
 */
export function useAccountPreferences(): AccountPreferences {
	const storage = useDataOrNull()?.storage ?? null;
	const version = usePreferencesVersion();
	// biome-ignore lint/correctness/useExhaustiveDependencies: `version` is the change signal; the readers take only `storage`.
	return useMemo(() => {
		const timezone = storage ? readTimeZonePreference(storage) : AUTO_TIME_ZONE;
		const locale = storage ? readLocalePreference(storage) : AUTO_LOCALE;
		const device = deviceTimeZone();
		const deviceLanguage = deviceLocale();
		return {
			timezone,
			locale,
			zone: effectiveTimeZone(timezone, device),
			localeValue: effectiveLocale(locale, deviceLanguage),
			deviceZone: device,
			deviceLocale: deviceLanguage,
		};
	}, [storage, version]);
}

/**
 * The one zone every instant on every screen is read in. The settings page, the message time
 * labels, the timeline's day split and the memory query all call this — never the device's zone
 * directly (enforced by `tools/check-local-time.mjs`).
 */
export function useAccountTimeZone(): string {
	return useAccountPreferences().zone;
}

/** The account's language, resolved for Intl (an `auto` account follows this device). */
export function useAccountLocale(): Locale {
	return useAccountPreferences().localeValue;
}

export interface SavePreferencesResult {
	/** Resolves `true` when stored; `false` (with `error`) when not, so the row can say why. */
	save: (patch: PreferencesPatch) => Promise<boolean>;
	pending: boolean;
	error: unknown;
	reset: () => void;
}

/**
 * The settings page saves through this hook and nothing else.
 *
 * Stage 1: the value is written to local storage, which is the whole truth on this device. There is
 * no request, so a save cannot half-succeed and no server response is invented. Stage 2 replaces
 * the body with `PATCH /v1/me/preferences`; the page's copy, pending state and failure line already
 * match that shape.
 */
export function useSavePreferences(): SavePreferencesResult {
	const storage = useDataOrNull()?.storage ?? null;
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<unknown>(null);

	const save = useCallback(
		async (patch: PreferencesPatch) => {
			setPending(true);
			setError(null);
			try {
				if (!storage) throw new Error("no-storage");
				writePreference(storage, patch);
				return true;
			} catch (failure) {
				setError(failure);
				return false;
			} finally {
				setPending(false);
			}
		},
		[storage],
	);

	const reset = useCallback(() => setError(null), []);

	return { save, pending, error, reset };
}
