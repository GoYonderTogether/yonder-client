import type { Storage } from "@yonder/ui-data";

export type DownloadPlatform = "macos" | "windows" | "android" | "ios" | "web";
export type EmbeddedApp = "wechat" | "qq" | "weibo" | "dingtalk" | "feishu" | "lark" | "alipay";
export type Environment = { type: "in-app"; app: EmbeddedApp } | { type: "browser"; platform: DownloadPlatform };

/** The first match wins, including the iPad's desktop-style user agent. */
export function detectEnvironment(userAgent: string, maxTouchPoints: number): Environment {
	if (/MicroMessenger/i.test(userAgent)) return { type: "in-app", app: "wechat" };
	if (/QQ\//i.test(userAgent)) return { type: "in-app", app: "qq" };
	if (/Weibo/i.test(userAgent)) return { type: "in-app", app: "weibo" };
	if (/DingTalk/i.test(userAgent)) return { type: "in-app", app: "dingtalk" };
	if (/AlipayClient/i.test(userAgent)) return { type: "in-app", app: "alipay" };
	if (/Lark/i.test(userAgent)) return { type: "in-app", app: "lark" };
	if (/Feishu/i.test(userAgent)) return { type: "in-app", app: "feishu" };
	if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) {
		return { type: "browser", platform: "ios" };
	}
	if (/Android/i.test(userAgent)) return { type: "browser", platform: "android" };
	if (/Macintosh/i.test(userAgent)) return { type: "browser", platform: "macos" };
	if (/Windows NT/i.test(userAgent)) return { type: "browser", platform: "windows" };
	return { type: "browser", platform: "web" };
}

const CHOICE_KEY = "landing.platform";
const CHOICE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PLATFORMS: readonly string[] = ["macos", "windows", "android", "ios", "web"];

export function readPlatformChoice(storage: Storage, now = Date.now()): DownloadPlatform | null {
	const saved = storage.get(CHOICE_KEY);
	if (!saved) return null;
	try {
		const value: unknown = JSON.parse(saved);
		if (
			typeof value === "object" &&
			value !== null &&
			"platform" in value &&
			"expiresAt" in value &&
			typeof value.platform === "string" &&
			PLATFORMS.includes(value.platform) &&
			typeof value.expiresAt === "number" &&
			value.expiresAt > now
		) {
			return value.platform as DownloadPlatform;
		}
	} catch {
		// A malformed preference is ignored just like an expired one.
	}
	storage.remove(CHOICE_KEY);
	return null;
}

export function writePlatformChoice(storage: Storage, platform: DownloadPlatform, now = Date.now()): void {
	storage.set(CHOICE_KEY, JSON.stringify({ platform, expiresAt: now + CHOICE_AGE_MS }));
}
