import type { MeResponse } from "@yonder/protocol";
import { expect, test } from "vitest";
import { accountLocale, accountTimeZone, deviceZone } from "./time.ts";

/** The account's answer, with only the two fields these helpers read. */
function me(timezone: MeResponse["timezone"], locale: MeResponse["locale"]): MeResponse {
	return { timezone, locale } as MeResponse;
}

test("before `me` answers, the device's own zone stands in", () => {
	expect(accountTimeZone(null)).toMatch(/^[A-Za-z]+\/[A-Za-z_+-]+$|^UTC$/);
	expect(accountTimeZone(null)).toBe(deviceZone());
});

test("a manual lock governs; an auto account reads the resolved zone", () => {
	expect(
		accountTimeZone(
			me(
				{ mode: "manual", zone: "Asia/Shanghai", manual: "Asia/Shanghai", device: "America/New_York" },
				{ mode: "auto", value: "zh-CN", manual: null, device: "en" },
			),
		),
	).toBe("Asia/Shanghai");
	expect(
		accountTimeZone(
			me(
				{ mode: "auto", zone: "Asia/Shanghai", manual: null, device: "America/New_York" },
				{ mode: "auto", value: "en", manual: null, device: "en" },
			),
		),
	).toBe("Asia/Shanghai");
});

test("the language comes from the same answer, never from the device once it has arrived", () => {
	expect(
		accountLocale(
			me(
				{ mode: "auto", zone: "UTC", manual: null, device: null },
				{ mode: "manual", value: "en", manual: "en", device: "zh-CN" },
			),
		),
	).toBe("en");
	expect(accountLocale(null)).toMatch(/^(zh-CN|en)$/);
});
