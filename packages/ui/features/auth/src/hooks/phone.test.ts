import { describe, expect, test } from "vitest";
import { DEFAULT_COUNTRY_CODE, formatNational, isValidE164, toE164 } from "./phone.ts";

describe("toE164", () => {
	test("joins the country code to what the user typed", () => {
		expect(toE164("+86", "138 0013 8000")).toBe("+8613800138000");
		expect(toE164("+86", "138-0013-8000")).toBe("+8613800138000");
	});

	test("drops a leading zero, which a national number often has", () => {
		expect(toE164("+44", "07911 123456")).toBe("+447911123456");
	});

	test("takes a pasted international number as it is", () => {
		expect(toE164("+86", "+1 (415) 555-0100")).toBe("+14155550100");
	});

	test("the default is the mainland", () => {
		expect(DEFAULT_COUNTRY_CODE).toBe("+86");
	});
});

describe("isValidE164", () => {
	test("accepts what toE164 produces", () => {
		expect(isValidE164(toE164("+86", "13800138000"))).toBe(true);
	});

	test("rejects too short, too long, and no country code", () => {
		expect(isValidE164("13800138000")).toBe(false);
		expect(isValidE164("+86138")).toBe(false);
		expect(isValidE164("+1234567890123456")).toBe(false);
	});
});

describe("formatNational", () => {
	test("groups a mainland number three-four-four as it is typed", () => {
		expect(formatNational("1")).toBe("1");
		expect(formatNational("138")).toBe("138");
		expect(formatNational("1380013")).toBe("138 0013");
		expect(formatNational("13800138000")).toBe("138 0013 8000");
	});

	test("ignores anything that is not a digit", () => {
		expect(formatNational("138-0013-8000")).toBe("138 0013 8000");
	});
});
