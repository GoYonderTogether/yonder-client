/**
 * The account's time zone and language: what applies on every device, and how this device helps
 * choose it while the account follows the device.
 *
 * Two shapes, one per setting (Google and Apple account settings do the same):
 *   - `auto`   — follow this device: its zone, its language. The device reports them to the account,
 *                which keeps the last report so a new device starts where its owner lives.
 *   - `manual` — a zone name, a language tag. Locked, and every device of the account shows it.
 *
 * The server is the source of truth (`MeResponse.timezone` / `.locale`): a change on one device is
 * seen on another when that device next reads `me`, with no restart. `syncAccountPreferences(me)`
 * is how the answer reaches here — one subscription, `useAccountPreferences`, that every screen,
 * every time label and the language provider reads. Local storage is a mirror for two reasons only:
 * the first paint in `index.html` must know the language before `me` arrives, and a signed-out screen
 * has no account yet. The server's answer always wins once it is here.
 */

import type { LocaleSetting, LocaleValue, MeResponse, TimezonePreference } from "@yonder/protocol";
import { deviceTimeZone } from "@yonder/ui-time";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMe } from "../hooks/account.ts";
import { keys } from "../query/keys.ts";
import { useApiOrNull, useDataOrNull } from "../query/provider.tsx";
import type { Storage } from "../storage/index.ts";
import { notifyPreferences, usePreferencesVersion } from "./store.ts";

export type { LocaleSetting, TimezonePreference };

/** `auto` follows this device; `manual` locks the account to one value. */
export type PreferenceMode = "auto" | "manual";
/** The two languages the interface ships. */
export type InterfaceLocale = LocaleValue;

/** What the settings page writes; a field left out is unchanged. */
export interface PreferencesPatch {
	timezone?: { mode: "auto" } | { mode: "manual"; zone: string };
	locale?: { mode: "auto" } | { mode: "manual"; value: InterfaceLocale };
}

/*
 * Stored under the app's own namespace (`yonder.` is added by the storage adapter). The first-paint
 * script in index.html reads `yonder.locale` and `yonder.locale-mode`, so it paints in the right
 * language and never flashes another one.
 */
const LOCALE_KEY = "locale";
const LOCALE_MODE_KEY = "locale-mode";

/** The device's own zone and language: the fallback before `me`, and what an `auto` account follows. */
export function deviceZone(): string {
	return deviceTimeZone();
}

/**
 * The stored language choice, as the first paint and a signed-out screen read it. Backward
 * compatible with a `yonder.locale` written before there was a mode: a stored language was a
 * deliberate choice, so it counts as manual.
 */
export function readLocalePreference(storage: Pick<Storage, "get">): {
	mode: PreferenceMode;
	locale: InterfaceLocale | null;
} {
	const stored = storage.get(LOCALE_KEY);
	const mode = storage.get(LOCALE_MODE_KEY);
	if (mode === "auto") return { mode: "auto", locale: null };
	if (stored === "zh-CN" || stored === "en") return { mode: "manual", locale: stored };
	return { mode: "auto", locale: null };
}

export function deviceLocale(): InterfaceLocale {
	const language = globalThis.navigator?.language ?? "en";
	return /^zh\b|^zh-/iu.test(language) ? "zh-CN" : "en";
}

/**
 * The zone every instant is read in. `manual` means the person's own pick, never the last device
 * report: a device that travelled must not move a locked account. `auto` is the server's resolved
 * zone, which it keeps from the device reports.
 */
export function effectiveTimeZone(timezone: TimezonePreference | null | undefined, device = deviceZone()): string {
	if (!timezone) return device;
	if (timezone.mode === "manual") return timezone.manual ?? timezone.zone ?? device;
	return timezone.zone || device;
}

/** The language every screen speaks: the resolved `value`, else this device's. */
export function effectiveLocale(locale: LocaleSetting | null | undefined, device = deviceLocale()): InterfaceLocale {
	if (!locale) return device;
	return locale.value || device;
}

/**
 * The mirror the first paint and a signed-out screen read. Written whenever the server's answer
 * changes; never the source of truth while signed in.
 */
export function mirrorLocale(storage: Storage, locale: LocaleSetting): void {
	try {
		if (locale.mode === "manual" && locale.value) storage.set(LOCALE_KEY, locale.value);
		else storage.remove(LOCALE_KEY);
		storage.set(LOCALE_MODE_KEY, locale.mode);
	} catch {
		// A locked store only costs the first paint; the app itself reads the server's answer.
	}
	notifyPreferences();
}

export interface AccountPreferences {
	/** The server's resolved settings; the device's own until `me` answers. */
	timezone: TimezonePreference;
	locale: LocaleSetting;
	/** The zone every screen reads instants in. */
	zone: string;
	/** The language every screen speaks. */
	localeValue: InterfaceLocale;
	/** This device's own zone, so 「跟随系统」 can say what it follows. */
	deviceZone: string;
	/** This device's own language, for the same line. */
	deviceLocale: InterfaceLocale;
	/** Whether the values came from the account; `false` while `me` is still on its way. */
	fromAccount: boolean;
}

/*
 * The one place the account's answer lands. `syncAccountPreferences` is called by the app whenever
 * `me` changes; `useAccountPreferences` reads it. Screens never call `useMe` for a zone themselves,
 * which keeps a single row renderable on its own (a unit test of a settings row, a dev preview).
 */
const ACCOUNT_AUTO_TIMEZONE: TimezonePreference = { mode: "auto", zone: "UTC", manual: null, device: null };
const ACCOUNT_AUTO_LOCALE: LocaleSetting = { mode: "auto", value: "en", manual: null, device: null };

let account: { timezone: TimezonePreference; locale: LocaleSetting } | null = null;
const accountListeners = new Set<() => void>();

function subscribeAccount(listener: () => void): () => void {
	accountListeners.add(listener);
	return () => accountListeners.delete(listener);
}

function accountSnapshot(): { timezone: TimezonePreference; locale: LocaleSetting } | null {
	return account;
}

/**
 * Record what `me` answered. Called by the app's provider-level effect; a new answer from any
 * source (a save, a realtime re-fetch, another device's change arriving on the next `me`) reaches
 * every screen from here.
 */
export function syncAccountPreferences(me: MeResponse | null | undefined): void {
	account = me ? { timezone: me.timezone, locale: me.locale } : null;
	for (const listener of [...accountListeners]) listener();
}

/** The pure shape for one answer; the hook and the tests share it. */
export function preferencesFor(
	answer: { timezone: TimezonePreference; locale: LocaleSetting } | null,
	device = { zone: deviceZone(), locale: deviceLocale() },
): AccountPreferences {
	if (!answer) {
		return {
			timezone: { ...ACCOUNT_AUTO_TIMEZONE, zone: device.zone },
			locale: { ...ACCOUNT_AUTO_LOCALE, value: device.locale },
			zone: device.zone,
			localeValue: device.locale,
			deviceZone: device.zone,
			deviceLocale: device.locale,
			fromAccount: false,
		};
	}
	return {
		timezone: answer.timezone,
		locale: answer.locale,
		zone: effectiveTimeZone(answer.timezone, device.zone),
		localeValue: effectiveLocale(answer.locale, device.locale),
		deviceZone: device.zone,
		deviceLocale: device.locale,
		fromAccount: true,
	};
}

/**
 * The account's choices, merging the server's answer with this device. Before `me` has answered —
 * a cold start, a signed-out screen, a single row rendered alone — the device's own zone and language
 * stand in, which is exactly what `auto` means, so nothing is invented.
 */
export function useAccountPreferences(): AccountPreferences {
	const version = usePreferencesVersion();
	const storage = useDataOrNull()?.storage ?? null;
	const answer = useSyncExternalStore(subscribeAccount, accountSnapshot, accountSnapshot);
	// Signed out there is no account: the stored choice is this device's own, exactly what the
	// landing and sign-in screens mean by their language button.
	const storedLocal = storage ? readLocalePreference(storage) : null;
	// `version` is the change signal for this device and for a save; `answer` is the account's own.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `version` is the change signal; the device readers take no arguments.
	return useMemo(
		() =>
			preferencesFor(answer, {
				zone: deviceZone(),
				locale: !answer && storedLocal?.mode === "manual" && storedLocal.locale ? storedLocal.locale : deviceLocale(),
			}),
		[answer, storedLocal, version],
	);
}

/**
 * The one zone every instant on every screen is read in. The settings page, the message time
 * labels, the timeline's day split and the memory query all call this — never the device's zone
 * directly (enforced by `tools/check-local-time.mjs`).
 */
export function useAccountTimeZone(): string {
	return useAccountPreferences().zone;
}

/** The account's language, resolved for Intl. */
export function useAccountLocale(): InterfaceLocale {
	return useAccountPreferences().localeValue;
}

export interface SavePreferencesResult {
	/** Resolves `true` when the server accepted it; `false` (with `error`) when it did not. */
	save: (patch: PreferencesPatch) => Promise<boolean>;
	pending: boolean;
	error: unknown;
	reset: () => void;
}

/**
 * The settings page saves through this hook and nothing else: `PATCH /v1/me/preferences`, whose
 * answer is the refreshed `MeResponse`, recorded so every screen shows it at once and stored in the
 * query cache so the next `me` read agrees. A failure is the server's own reason: a 400 on an
 * unknown IANA name shows as such, never smoothed into "could not save".
 *
 * Without a provider (a unit test of one row) the request cannot be made; the hook reports that
 * plainly instead of pretending to store the value.
 */
export function useSavePreferences(): SavePreferencesResult {
	const data = useDataOrNull();
	const api = useApiOrNull();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<unknown>(null);

	const save = useCallback(
		async (patch: PreferencesPatch) => {
			setPending(true);
			setError(null);
			try {
				if (!data || !api) throw new Error("no-provider");
				const me = await api.updatePreferences(patch);
				data.queryClientForPreferences.setQueryData(keys.me(), me);
				syncAccountPreferences(me);
				mirrorLocale(data.storage, me.locale);
				return true;
			} catch (failure) {
				setError(failure);
				return false;
			} finally {
				setPending(false);
			}
		},
		[api, data],
	);

	const reset = useCallback(() => setError(null), []);

	return { save, pending, error, reset };
}

/**
 * The app keeps the account's answer here. A component calls this once, inside the provider, so a
 * row elsewhere reads the zone without its own `me` request and still renders on its own.
 */
export function useAccountPreferencesSync(): void {
	const signedIn = useDataOrNull() !== null;
	const me = useMe({ enabled: signedIn });
	const answer = me.data;
	useEffect(() => {
		syncAccountPreferences(answer);
	}, [answer]);
}

/**
 * Keep this device's report current while the account follows the device. A `manual` account is not
 * reported at all: its own pick governs, and the report would only overwrite the hint. Runs when the
 * signed-in answer arrives and again when its mode or its device report changes — a person who
 * switches to `auto` is followed from that moment.
 */
export function useDevicePreferenceReport(): void {
	const api = useApiOrNull();
	const answer = useSyncExternalStore(subscribeAccount, accountSnapshot, accountSnapshot);
	const reported = useRef<string | null>(null);
	const timezone = answer?.timezone ?? null;
	const locale = answer?.locale ?? null;
	const zone = deviceZone();
	const language = deviceLocale();

	useEffect(() => {
		if (!api || !timezone || !locale) return;
		void (async () => {
			if (timezone.mode === "auto" && timezone.device !== zone && reported.current !== `tz:${zone}`) {
				reported.current = `tz:${zone}`;
				try {
					await api.reportDeviceTimezone(zone);
				} catch {
					// The account keeps its last known zone, which is still a real zone; next launch retries.
				}
			}
			if (locale.mode === "auto" && locale.device !== language && reported.current !== `lc:${language}`) {
				reported.current = `lc:${language}`;
				try {
					await api.reportDeviceLocale(language);
				} catch {
					// Same as the zone: the stored answer stays, and the next launch tries again.
				}
			}
		})();
	}, [api, timezone, locale, zone, language]);
}
