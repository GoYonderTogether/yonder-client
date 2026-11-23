import { LEGACY_API_ORIGIN, PRODUCTION_API_ORIGIN } from "./config.ts";
import { isTauri } from "./keychain.ts";
import { isDesktopExperience } from "./platform.ts";

export function supportsCommerce() {
	return !isTauri() || (isDesktopExperience() && /Macintosh|Mac OS X|Windows/i.test(navigator.userAgent));
}

const destinations = {
	"wechat-auth": ["https:", "open.weixin.qq.com", "/connect/qrconnect"],
	"wechat-pay": ["weixin:", "wxpay", "/bizpayurl"],
	alipay: ["https:", "openapi.alipay.com", "/gateway.do"],
} as const;

export function trustedCommerceUrl(kind: keyof typeof destinations, value: string): string | undefined {
	const authority = /^(?:https|weixin):\/\/([^/?#]+)/.exec(value)?.[1];
	const fragmentStart = value.indexOf("#");
	if (!authority || authority.includes("@") || /[\s\\]/.test(value)) return;
	if (fragmentStart !== -1 && (kind !== "wechat-auth" || value.slice(fragmentStart) !== "#wechat_redirect")) return;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return;
	}
	const [protocol, host, path] = destinations[kind];
	// Normalize the URL before using the destination's literal path.
	if (url.protocol === protocol && url.hostname === host && url.pathname === path && !url.port && url.search) {
		return url.href;
	}
}

const wechatCallbackPath = "/v1/auth/wechat/web/callback";
export const wechatAuthorizationOrigin = "https://open.weixin.qq.com";

export function wechatAuthorizationFrameUrl(value: string, apiOrigin: string, english: boolean) {
	const authorized = trustedCommerceUrl("wechat-auth", value);
	if (!authorized) return;
	const url = new URL(authorized);
	const params = url.searchParams;
	const required = ["appid", "scope", "state", "redirect_uri", "response_type"];
	if (required.some((key) => params.getAll(key).length !== 1)) return;

	const appid = params.get("appid") ?? "";
	const state = params.get("state") ?? "";
	const redirectUri = params.get("redirect_uri") ?? "";
	if (!/^[a-zA-Z0-9_-]+$/.test(appid) || !/^[a-f0-9]{64}$/.test(state)) return;
	if (params.get("scope") !== "snsapi_login" || params.get("response_type") !== "code") return;
	if (
		![apiOrigin, PRODUCTION_API_ORIGIN, LEGACY_API_ORIGIN].some(
			(origin) => origin.startsWith("https://") && redirectUri === origin + wechatCallbackPath,
		)
	)
		return;

	url.hash = "";
	url.search = new URLSearchParams({
		appid,
		scope: "snsapi_login",
		redirect_uri: redirectUri,
		state,
		login_type: "jssdk",
		self_redirect: "true",
		...(english ? { lang: "en" } : {}),
	}).toString();
	return url.href;
}

export function isWechatAuthorizationReady(event: MessageEvent, source: Window | null) {
	if (
		!source ||
		event.source !== source ||
		event.origin !== wechatAuthorizationOrigin ||
		typeof event.data !== "string"
	) {
		return false;
	}
	try {
		const message = JSON.parse(event.data);
		return message?.type === "status" && (message.status === "wxReady" || message.status === "wxQRcodeReady");
	} catch {
		return false;
	}
}

export function openCommerceUrl(url: string, kind: "alipay") {
	const trusted = trustedCommerceUrl(kind, url);
	if (!trusted || !supportsCommerce()) throw new Error("Invalid commerce URL");
	if (isTauri()) {
		return import("@tauri-apps/api/core").then(({ invoke }) =>
			invoke<void>("plugin:opener|open_url", { url: trusted }),
		);
	}
	window.open(trusted, "_blank", "noopener,noreferrer");
}
