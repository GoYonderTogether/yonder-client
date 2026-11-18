import { describe, expect, test } from "vitest";
import { en } from "./en.ts";
import { visitsMessagesEn } from "./visits-en.ts";
import { visitsMessagesZhCN } from "./visits-zh-CN.ts";
import { zhCN } from "./zh-CN.ts";

describe("the visit table", () => {
	test("Chinese has exactly the English keys", () => {
		expect(Object.keys(visitsMessagesZhCN).sort()).toEqual(Object.keys(visitsMessagesEn).sort());
		expect(Object.keys(visitsMessagesZhCN.errors).sort()).toEqual(Object.keys(visitsMessagesEn.errors).sort());
	});

	test("the three visit refusals resolve through the shared error table", () => {
		for (const table of [en, zhCN]) {
			for (const code of ["visit_limit", "visit_denied", "visit_cap"] as const) {
				const sentence = table.errors[code];
				expect(typeof sentence).toBe("string");
				expect(sentence.trim()).not.toBe("");
			}
		}
		expect(zhCN.errors.visit_denied).not.toBe(en.errors.visit_denied);
	});
});
