// @vitest-environment jsdom
import { createMemoryStorage, readLocale, readStyleChoice, readThemeChoice } from "@yonder/ui-data";
import { expect, test } from "vitest";
import { createContactStorage } from "./contact-preferences.ts";

test("auxiliary windows inherit chosen device preferences while keeping account data private", () => {
	const main = createMemoryStorage();
	main.set("locale", "zh-CN");
	main.set("theme", "dark");
	main.set("style", "glow");
	main.set("query-cache", "main-account");
	main.set("installation-id", "main-device");
	main.set("refresh-token", "main-refresh");
	const auxiliary = createContactStorage(main);
	expect(readLocale(auxiliary)).toBe("zh-CN");
	expect(readThemeChoice(auxiliary)).toBe("dark");
	expect(readStyleChoice(auxiliary)).toBe("glow");
	for (const key of ["query-cache", "installation-id", "refresh-token"]) expect(auxiliary.get(key)).toBeNull();
	auxiliary.set("theme", "light");
	auxiliary.set("style", "classic");
	expect(readThemeChoice(main)).toBe("dark");
	expect(readStyleChoice(main)).toBe("glow");
});
