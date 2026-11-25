/**
 * The zone this mini program reads instants in: the account's resolved `me.timezone`, and this
 * device's own until that answers (or while the account follows the device).
 *
 * The formatting itself is never done here: every caller goes through `@yonder/ui-time`, which falls
 * back to a fixed offset on a runtime whose `Intl` ignores IANA names.
 */
import type { MeResponse } from "@yonder/protocol";
import { canonicalTimeZone, deviceTimeZone } from "@yonder/ui-time";

/** What this device is set to, sent the same way the web app sends it while the account is auto. */
export function deviceZone(): string {
	return deviceTimeZone();
}

/**
 * The zone every instant is read in. `manual` is the person's own pick and never the last device
 * report, so a phone that travelled does not move a locked account.
 */
export function accountTimeZone(me: MeResponse | null | undefined): string {
	const timezone = me?.timezone;
	const device = deviceZone();
	if (!timezone) return device;
	if (timezone.mode === "manual") return canonicalTimeZone(timezone.manual ?? timezone.zone) ?? device;
	return canonicalTimeZone(timezone.zone) ?? device;
}

/** The language the mini program speaks, from the same answer; `me.settings.locale` for old servers. */
export function accountLocale(me: MeResponse | null | undefined): "zh-CN" | "en" {
	return me?.locale?.value ?? me?.settings.locale ?? (deviceIsChinese() ? "zh-CN" : "en");
}

function deviceIsChinese(): boolean {
	try {
		return /^zh\b|^zh-/iu.test(TaroLanguage());
	} catch {
		return false;
	}
}

function TaroLanguage(): string {
	return globalThis.navigator?.language ?? "en";
}
