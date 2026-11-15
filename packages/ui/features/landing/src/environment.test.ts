import { createMemoryStorage } from "@yonder/ui-data";
import { describe, expect, test } from "vitest";
import { createDownloadCatalog } from "./downloads.ts";
import { detectEnvironment, readPlatformChoice, writePlatformChoice } from "./environment.ts";

describe("detectEnvironment", () => {
	test.each([
		["WeChat on iOS", "Mozilla/5.0 (iPhone) MicroMessenger/8.0", 5, { type: "in-app", app: "wechat" }],
		["WeChat on Android", "Mozilla/5.0 (Linux; Android 14) MicroMessenger/8.0", 5, { type: "in-app", app: "wechat" }],
		["WeChat before other apps", "iPhone QQ/9.0 MicroMessenger/8.0", 5, { type: "in-app", app: "wechat" }],
		["QQ", "Mozilla/5.0 (iPhone) QQ/9.0", 5, { type: "in-app", app: "qq" }],
		["Weibo", "Mozilla/5.0 (Android) Weibo", 5, { type: "in-app", app: "weibo" }],
		["DingTalk", "Mozilla/5.0 (iPhone) DingTalk", 5, { type: "in-app", app: "dingtalk" }],
		["Feishu", "Mozilla/5.0 (iPhone) Feishu", 5, { type: "in-app", app: "feishu" }],
		["Lark", "Mozilla/5.0 (Android) Lark", 5, { type: "in-app", app: "lark" }],
		["Alipay", "Mozilla/5.0 (iPhone) AlipayClient", 5, { type: "in-app", app: "alipay" }],
		["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5, { type: "browser", platform: "ios" }],
		["iPad", "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", 5, { type: "browser", platform: "ios" }],
		["iPod", "Mozilla/5.0 (iPod touch)", 5, { type: "browser", platform: "ios" }],
		[
			"iPad pretending to be Mac",
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
			5,
			{ type: "browser", platform: "ios" },
		],
		["Android", "Mozilla/5.0 (Linux; Android 14)", 5, { type: "browser", platform: "android" }],
		["macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0, { type: "browser", platform: "macos" }],
		["Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0, { type: "browser", platform: "windows" }],
		["Linux", "Mozilla/5.0 (X11; Linux x86_64)", 0, { type: "browser", platform: "web" }],
		["empty", "", 0, { type: "browser", platform: "web" }],
	])("%s", (_name, ua, touches, expected) => {
		expect(detectEnvironment(ua, touches)).toEqual(expected);
	});
});

describe("platform choice", () => {
	test("uses the existing store for seven days and ignores invalid data", () => {
		const storage = createMemoryStorage();
		writePlatformChoice(storage, "windows", 100);
		expect(readPlatformChoice(storage, 100 + 7 * 24 * 60 * 60 * 1000 - 1)).toBe("windows");
		expect(readPlatformChoice(storage, 100 + 7 * 24 * 60 * 60 * 1000)).toBeNull();
		storage.set("landing.platform", "not JSON");
		expect(readPlatformChoice(storage, 100)).toBeNull();
		storage.set("landing.platform", JSON.stringify({ platform: "unknown", expiresAt: 200 }));
		expect(readPlatformChoice(storage, 100)).toBeNull();
	});
});

describe("download catalog", () => {
	test("uses the build version, the stable Android APK, and the configured iOS link", () => {
		const catalog = createDownloadCatalog("0.3.26111401");
		expect(catalog.macos.url).toBe("https://dl.zethai.cn/desktop/0.3.26111401/Yonder_0.3.26111401_aarch64.dmg");
		expect(catalog.windows.url).toBe("https://dl.zethai.cn/desktop/0.3.26111401/Yonder_0.3.26111401_x64-setup.exe");
		expect(catalog.android.url).toBe("https://dl.zethai.cn/android/yonder-android.apk");
		expect(catalog.ios.url).toBeNull();
		expect(catalog.web.url).toBe("/messages");
		const configured = createDownloadCatalog("1", { iosUrl: " " });
		expect(configured.ios.url).toBeNull();
		expect(createDownloadCatalog("1", { iosUrl: " https://example.com/ios " }).ios.url).toBe("https://example.com/ios");
	});
});
