import { describe, expect, test } from "vitest";
import { en } from "./en.ts";
import { pricingMessagesEn } from "./pricing-en.ts";
import { pricingMessagesZhCN } from "./pricing-zh-CN.ts";
import { zhCN } from "./zh-CN.ts";

const flatten = (value: object, prefix = ""): string[] =>
	Object.entries(value).flatMap(([key, child]) =>
		typeof child === "string" ? [`${prefix}${key}`] : flatten(child, `${prefix}${key}.`),
	);

describe("the price page table", () => {
	test("Chinese has exactly the English keys", () => {
		expect(flatten(pricingMessagesZhCN).sort()).toEqual(flatten(pricingMessagesEn).sort());
		expect(flatten(zhCN.pricing).sort()).toEqual(flatten(en.pricing).sort());
	});

	test("neither language names a vendor or a model id", () => {
		for (const text of [...Object.values(flatten(pricingMessagesEn)), ...flatten(pricingMessagesZhCN)]) {
			expect(text).not.toMatch(/DeepSeek|RightCode|deepseek-flash|glm-5\.3-flash|GPT|Claude/i);
		}
	});
});
