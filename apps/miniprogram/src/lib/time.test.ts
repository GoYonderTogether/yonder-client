import { expect, test, vi } from "vitest";

const values = new Map<string, string>();
vi.mock("@tarojs/taro", () => ({
	default: {
		getStorageSync: (key: string) => values.get(key) ?? "",
		setStorageSync: (key: string, value: string) => void values.set(key, value),
	},
}));

const { accountTimeZone } = await import("./time.ts");

test("the mini program reads instants in this device's zone until the account chooses one", () => {
	values.clear();
	expect(accountTimeZone()).toMatch(/^[A-Za-z]+\/[A-Za-z_+-]+$|^UTC$/);
});

test("a manual zone is honoured; a mode of auto is not", () => {
	values.set("yonder.mini.timezone", "Asia/Shanghai");
	expect(accountTimeZone()).not.toBe("Asia/Shanghai");
	values.set("yonder.mini.timezone-mode", "manual");
	expect(accountTimeZone()).toBe("Asia/Shanghai");
	values.set("yonder.mini.timezone-mode", "auto");
	expect(accountTimeZone()).not.toBe("Asia/Shanghai");
});
