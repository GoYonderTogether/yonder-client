/**
 * The zone this mini program reads instants in. The account's choice, when there is one, and this
 * device's zone otherwise — the same rule `@yonder/ui-data`'s `useAccountTimeZone()` applies on the
 * web app. The choice is stored under `yonder.mini.timezone` / `yonder.mini.timezone-mode` until the
 * account's own value arrives from `me`.
 *
 * Formatting itself is never done here: every caller goes through `@yonder/ui-time`, which falls
 * back to a fixed offset on a runtime whose `Intl` ignores IANA names.
 */

import Taro from "@tarojs/taro";
import { canonicalTimeZone, deviceTimeZone } from "@yonder/ui-time";

const ZONE_KEY = "yonder.mini.timezone";
const ZONE_MODE_KEY = "yonder.mini.timezone-mode";

function storageGet(key: string): string {
	try {
		return Taro.getStorageSync(key) || "";
	} catch {
		return "";
	}
}

export function deviceZone(): string {
	return deviceTimeZone();
}

/** The zone every instant is read in. */
export function accountTimeZone(): string {
	const stored = canonicalTimeZone(storageGet(ZONE_KEY));
	return storageGet(ZONE_MODE_KEY) === "manual" && stored ? stored : deviceZone();
}
