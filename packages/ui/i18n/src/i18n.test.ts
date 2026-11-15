import { describe, expect, test } from "vitest";
import { DEFAULT_LOCALE, isLocale, LOCALES, resolveLocale } from "./i18n.ts";
import { en } from "./locales/en.ts";
import { zhCN } from "./locales/zh-CN.ts";

/** Every leaf key in a nested object, dot-separated. */
function leafKeys(value: unknown, prefix = ""): string[] {
	if (typeof value !== "object" || value === null) return [prefix];
	return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
}

describe("locale resolution", () => {
	test("a stored choice wins", () => {
		expect(resolveLocale("zh-CN")).toBe("zh-CN");
		expect(resolveLocale("en")).toBe("en");
	});

	test("any Chinese tag is Chinese, including a bare zh", () => {
		expect(resolveLocale("zh")).toBe("zh-CN");
		expect(resolveLocale("zh-Hans-CN")).toBe("zh-CN");
		expect(resolveLocale("zh_TW")).toBe("zh-CN");
	});

	test("anything else is English", () => {
		expect(resolveLocale("fr-FR")).toBe("en");
		expect(resolveLocale("")).toBe("en");
		expect(resolveLocale(undefined)).toBe("en");
		expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
	});

	test("only two locales are offered", () => {
		expect(LOCALES).toEqual(["zh-CN", "en"]);
		expect(isLocale("en")).toBe(true);
		expect(isLocale("ja")).toBe(false);
	});
});

describe("message tables", () => {
	test("Chinese has exactly the keys English has", () => {
		expect(leafKeys(zhCN).sort()).toEqual(leafKeys(en).sort());
	});

	test("no key is empty in either language", () => {
		for (const table of [en, zhCN]) {
			for (const key of leafKeys(table)) {
				const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], table);
				expect(typeof value, key).toBe("string");
				expect((value as string).trim(), key).not.toBe("");
			}
		}
	});

	test("Chinese text actually differs from English", () => {
		expect(zhCN.auth.signInTitle).not.toBe(en.auth.signInTitle);
		expect(zhCN.nav.me).toBe("我");
	});
});
