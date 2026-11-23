import { expect, test } from "vitest";
import { trustedCommerceUrl } from "./commerce-url.ts";

test("authorization, redirect and QR accept only their exact payment or login destination", () => {
	expect(trustedCommerceUrl("wechat-auth", "https://open.weixin.qq.com:443/connect/qrconnect?state=test")).toBe(
		"https://open.weixin.qq.com/connect/qrconnect?state=test",
	);
	const officialAuthorizeUrl = "https://open.weixin.qq.com/connect/qrconnect?state=test#wechat_redirect";
	expect(trustedCommerceUrl("wechat-auth", officialAuthorizeUrl)).toBe(officialAuthorizeUrl);
	expect(trustedCommerceUrl("alipay", "https://openapi.alipay.com/gateway.do?sign=test")).toBeDefined();
	expect(trustedCommerceUrl("wechat-pay", "weixin://wxpay/bizpayurl?pr=test")).toBeDefined();
	for (const url of [
		"https://open.weixin.qq.com.evil.invalid/connect/qrconnect?state=test",
		"https://@open.weixin.qq.com/connect/qrconnect?state=test",
		"https://user@open.weixin.qq.com/connect/qrconnect?state=test",
		"https://open.weixin.qq.com:80/connect/qrconnect?state=test",
		"https://open.weixin.qq.com/connect/qrconnect/other?state=test",
		"https://open.weixin.qq.com/connect/qrconnect?state=test#fragment",
		"https://open.weixin.qq.com/connect/qrconnect?state=test#WECHAT_REDIRECT",
		"https://open.weixin.qq.com/connect/qrconnect?state=test#wechat_redirect_extra",
		"https://open.weixin.qq.com/connect/qrconnect?state=test#",
		"http://open.weixin.qq.com/connect/qrconnect?state=test",
	]) {
		expect(trustedCommerceUrl("wechat-auth", url)).toBeUndefined();
	}
	expect(trustedCommerceUrl("alipay", "https://openapi.alipay.com/redirect?state=test")).toBeUndefined();
	expect(trustedCommerceUrl("wechat-pay", "weixin://dl/business?ticket=test")).toBeUndefined();
});
