import { expect, type Page, type Route, test } from "@playwright/test";
import type { BillingProduct, MeResponse } from "@yonder/protocol";
import { bot, isolateChat, person } from "./chat-fixture.ts";

const wechatOrigin = "https://open.weixin.qq.com";
const callbackUrl = "https://yonderbot.net/v1/auth/wechat/web/callback";
const state = "a".repeat(64);
const authorizeParams = {
	appid: "isolated-test-app",
	scope: "snsapi_login",
	redirect_uri: callbackUrl,
	state,
};
const authorizePath = `${wechatOrigin}/connect/qrconnect`;
const authorizeUrl = `${authorizePath}?${new URLSearchParams({ ...authorizeParams, response_type: "code" })}#wechat_redirect`;
const frameUrl = `${authorizePath}?${new URLSearchParams({
	...authorizeParams,
	login_type: "jssdk",
	self_redirect: "true",
})}`;
const qr = "weixin://wxpay/bizpayurl?pr=fixture-only";
const alipayUrl = "https://openapi.alipay.com/gateway.do?sign=fixture-only";
const ticket = "isolated-wechat-ticket";
const attempt = { ticket, authorizeUrl, expiresIn: 60 };
const product: BillingProduct = {
	id: "isolated-test-product",
	title: "测试额度包",
	amountMinor: 1234,
	currency: "CNY",
	providers: ["wechat", "alipay"],
};
const account: MeResponse = {
	member: person,
	bot,
	signInMethods: [{ channel: "sms", masked: "****1111", boundAt: "2026-11-21T00:00:00Z" }],
	hasPassword: true,
	handleChange: { canChange: true, nextChangeAt: null },
	settings: { locale: "zh-CN", theme: "light" },
};

async function isolateCommerce(page: Page) {
	await isolateChat(page, { items: [] });
	await page.route("**/v1/me", (route) => route.fulfill({ json: account }));
	await page.route("**/v1/quota/{config,rates}", (route) => route.fulfill({ status: 404, json: {} }));
	await page.route("**/v1/usage/overview?**", (route) => route.fulfill({ status: 404, json: {} }));
}

const readyMessage = JSON.stringify({ type: "status", status: "wxReady" });
const qrReadyMessage = JSON.stringify({ type: "status", status: "wxQRcodeReady" });

async function stubWechat(page: Page, { readyOnFirstLoad = false } = {}) {
	await page.route("**/v1/auth/wechat/web/config", (route) => route.fulfill({ json: { enabled: true } }));
	let loads = 0;
	await page.context().route(`${authorizePath}?**`, (route) => {
		expect(route.request().url()).toBe(frameUrl);
		loads++;
		const message = readyOnFirstLoad ? qrReadyMessage : loads > 1 ? readyMessage : undefined;
		return route.fulfill({
			contentType: "text/html",
			body: `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>微信授权测试页面</title>
				${message ? `<script>parent.postMessage(${JSON.stringify(message)}, "*")</script>` : ""}
				<h1>微信授权测试页面</h1><p>隔离测试，无真实二维码</p></html>`,
		});
	});
}

async function wechatFrame(page: Page, title: string) {
	const dialog = page.getByRole("dialog", { name: title });
	const frame = dialog.locator('iframe[title="微信授权"]');
	await expect(frame).toBeVisible();
	await expect(frame).toHaveAttribute("src", frameUrl);
	await expect(frame).toHaveAttribute("width", "300");
	await expect(frame).toHaveAttribute("height", "400");
	await expect(frame).toHaveAttribute("allow", `local-network-access ${wechatOrigin}`);
	await expect(frame).toHaveAttribute(
		"sandbox",
		"allow-scripts allow-same-origin allow-top-navigation-to-custom-protocols",
	);
	await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
	await expect(frame.contentFrame().getByRole("heading", { name: "微信授权测试页面" })).toBeVisible();
	await expect(dialog.getByRole("button", { name: "打开微信二维码" })).toHaveCount(0);
	expect(page.context().pages()).toHaveLength(1);
	const authorizationFrame = page.frame({ url: frameUrl });
	if (!authorizationFrame) throw new Error("Missing WeChat authorization frame");
	return authorizationFrame;
}

test("WeChat sign-in fixture uses consent, device metadata and the usual signed-in destination", async ({
	page,
}, info) => {
	await isolateCommerce(page);
	await page.route("**/v1/auth/refresh", (route) => route.fulfill({ status: 401, json: {} }));
	await stubWechat(page);
	let starts = 0;
	let checks = 0;
	let callbackReceived = false;
	await page.route(`${callbackUrl}?**`, (route) => {
		expect(route.request().method()).toBe("GET");
		expect(new URL(route.request().url()).searchParams.get("state")).toBe(state);
		callbackReceived = true;
		return route.fulfill({
			contentType: "text/html",
			headers: { "content-security-policy": "default-src 'none'; frame-ancestors 'none'" },
			body: "<!doctype html><title>Authorization complete</title>",
		});
	});
	await page.route("**/v1/auth/wechat/web/start", (route) => {
		starts++;
		expect(route.request().method()).toBe("POST");
		expect(route.request().postDataJSON()).toEqual({ agreeTerms: true });
		return route.fulfill({ json: attempt });
	});
	await page.route("**/v1/auth/wechat/web/status", (route) => {
		checks++;
		expect(route.request().method()).toBe("POST");
		expect(route.request().headers().authorization).toBeUndefined();
		expect(route.request().postDataJSON()).toMatchObject({
			ticket,
			device: { platform: "web", installationId: expect.any(String) },
		});
		return route.fulfill({
			json: !callbackReceived
				? { status: "pending" }
				: {
						status: "signed_in",
						accessToken: "isolated-qr-login",
						expiresIn: 3600,
						isNewAccount: false,
						me: account,
						invite: { applied: false },
					},
		});
	});

	await page.goto("/sign-in?next=%2Fmessages");
	const start = page.getByRole("button", { name: "微信登录" });
	await start.click();
	await expect(page.getByRole("alert")).toHaveText("请先勾选同意。");
	await expect(page.getByRole("checkbox")).toBeFocused();
	expect(starts).toBe(0);
	await page.getByRole("checkbox").check();
	await start.click();
	const dialog = page.getByRole("dialog", { name: "微信登录" });
	const frame = await wechatFrame(page, "微信登录");
	await page.evaluate(
		({ origin, message }) => {
			const source = document.querySelector("iframe")?.contentWindow;
			window.dispatchEvent(new MessageEvent("message", { origin, source: window, data: message }));
			window.dispatchEvent(new MessageEvent("message", { origin: location.origin, source, data: message }));
		},
		{ origin: wechatOrigin, message: readyMessage },
	);
	await frame.evaluate(() => {
		parent.postMessage('{"type":"status","status":"unexpected"}', "*");
	});
	await expect(dialog.getByText("正在等待微信授权…")).toHaveCount(0);
	expect(checks).toBe(0);
	await page.screenshot({ path: info.outputPath("wechat-sign-in-fixture.png") });

	const signInUrl = page.url();
	await frame.evaluate((url) => {
		const link = document.createElement("a");
		link.href = url;
		link.target = "_top";
		link.textContent = "Test ordinary top navigation";
		document.body.append(link);
	}, new URL("/sign-in?unexpected-top-navigation=1", signInUrl).href);
	await dialog.frameLocator("iframe").getByRole("link", { name: "Test ordinary top navigation" }).click();

	await frame.evaluate((message) => parent.postMessage(message, "*"), readyMessage);
	await expect.poll(() => checks).toBe(1);
	await expect(page).toHaveURL(signInUrl);
	const reloaded = frame.waitForNavigation({ url: frameUrl, waitUntil: "domcontentloaded" });
	await frame.evaluate((message) => {
		parent.postMessage(message, "*");
		location.reload();
	}, readyMessage);
	await reloaded;
	await expect(dialog.frameLocator("iframe").getByRole("heading", { name: "微信授权测试页面" })).toBeVisible();
	const callback = page.waitForRequest((request) => request.url().startsWith(`${callbackUrl}?`));
	await frame.evaluate((url) => {
		location.href = url;
	}, `${callbackUrl}?code=isolated&state=${state}`);
	expect((await callback).frame()).toBe(frame);
	await expect(page).toHaveURL(/\/messages$/);
	expect(starts).toBe(1);
	expect(checks).toBe(2);
	expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(ticket);
});

test("account security links web WeChat and preserves the mini-program sign-in method", async ({ page }) => {
	await isolateCommerce(page);
	const opens = await mockShell(page, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
	await stubWechat(page, { readyOnFirstLoad: true });
	let linked = false;
	let refreshes = 0;
	await page.route("**/v1/me", (route) => {
		if (linked) refreshes++;
		return route.fulfill({
			json: {
				...account,
				signInMethods: [...account.signInMethods, { channel: "wechat", boundAt: "2026-11-21T00:00:00Z" }],
			},
		});
	});
	await page.route("**/v1/auth/wechat/web/link/start", (route) => {
		expect(route.request().method()).toBe("POST");
		expect(route.request().headers().authorization).toBe("Bearer isolated-chat-ui");
		return route.fulfill({ json: attempt });
	});
	await page.route("**/v1/auth/wechat/web/status", (route) => {
		expect(route.request().headers().authorization).toBe("Bearer isolated-chat-ui");
		expect(route.request().postDataJSON()).toEqual({ ticket });
		linked = true;
		return route.fulfill({ json: { status: "linked" } });
	});
	await page.goto("/me/account");
	const miniProgram = page.getByRole("button", { name: /微信（小程序）.*已绑定/ });
	await expect(miniProgram).toBeVisible();
	await page.getByRole("button", { name: "绑定微信" }).click();
	await expect(page.getByRole("dialog", { name: "绑定微信" }).getByText("微信已绑定。")).toBeVisible();
	await expect.poll(() => refreshes).toBeGreaterThan(0);
	await expect(miniProgram).toBeVisible();
	expect(await opens()).toEqual([]);
	expect(page.context().pages()).toHaveLength(1);
});

test("WeChat checkout shows the server quote and waits for payment confirmation past the deadline", async ({
	page,
}, info) => {
	await isolateCommerce(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.clock.install();
	await page.route("**/v1/billing/catalog", (route) => route.fulfill({ json: { products: [product] } }));
	let expiresAt: string;
	let paid = false;
	let checks = 0;
	await page.route("**/v1/billing/orders", async (route) => {
		expect(route.request().headers().authorization).toBe("Bearer isolated-chat-ui");
		expect(route.request().postDataJSON()).toEqual({ productId: product.id, provider: "wechat" });
		expiresAt = new Date((await page.evaluate(() => Date.now())) + 30_000).toISOString();
		return route.fulfill({ json: { id: "test-order", status: "pending", expiresAt, action: { type: "qr", url: qr } } });
	});
	await page.route("**/v1/billing/orders/test-order", (route) => {
		expect(route.request().method()).toBe("GET");
		checks++;
		return route.fulfill({ json: { id: "test-order", status: paid ? "paid" : "pending", expiresAt } });
	});
	await page.goto("/me/quota");
	await page.getByRole("button", { name: "购买额度" }).click();
	const checkout = page.getByRole("dialog", { name: "购买额度" });
	await expect(checkout.getByText("¥12.34")).toBeVisible();
	await checkout.getByRole("button", { name: "微信支付" }).click();
	await expect(checkout.getByRole("img", { name: "用微信扫码支付" })).toBeVisible();
	await page.screenshot({ path: info.outputPath("wechat-checkout.png") });
	const initialChecks = checks;
	await page.clock.fastForward(31_000);
	await expect(checkout.getByText("正在确认最终支付结果…")).toBeVisible();
	await expect(checkout.getByRole("img")).toHaveCount(0);
	await expect(checkout.getByText("支付已确认。")).toHaveCount(0);
	await expect.poll(() => checks).toBeGreaterThan(initialChecks);
	paid = true;
	await page.clock.fastForward(6_000);
	await expect(checkout.getByText("支付已确认。")).toBeVisible();
	const stored = await page.evaluate(() => JSON.stringify(localStorage));
	for (const value of [product.id, "test-order", qr]) expect(stored).not.toContain(value);
});

async function mockShell(page: Page, userAgent: string) {
	await page.addInitScript((userAgent) => {
		const opens: string[] = [];
		Object.defineProperty(navigator, "userAgent", { value: userAgent });
		if (/iPhone|iPad|Android/i.test(userAgent)) {
			localStorage.setItem("dev.yonder.desktop.refresh-token", "isolated-commerce-shell");
		}
		Object.assign(window, {
			commerceBrowserOpens: opens,
			__TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
			__TAURI_INTERNALS__: {
				metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
				transformCallback: () => 1,
				unregisterCallback() {},
				invoke: async (command: string, args: { url: string }) => {
					if (command === "get_desktop_refresh_token") return "isolated-commerce-shell";
					if (command === "plugin:opener|open_url") opens.push(args.url);
					return null;
				},
			},
		});
	}, userAgent);
	return () => page.evaluate(() => (window as unknown as { commerceBrowserOpens: string[] }).commerceBrowserOpens);
}

test("Windows Alipay opens the exact checkout URL only after explicit confirmation", async ({ page }) => {
	await isolateCommerce(page);
	const opens = await mockShell(page, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
	await page.route("**/v1/billing/catalog", (route) => route.fulfill({ json: { products: [product] } }));
	const order = { id: "test-alipay", status: "pending", expiresAt: new Date(Date.now() + 60_000).toISOString() };
	await page.route("**/v1/billing/orders", (route) => {
		expect(route.request().postDataJSON()).toEqual({ productId: product.id, provider: "alipay" });
		return route.fulfill({ json: { ...order, action: { type: "redirect", url: alipayUrl } } });
	});
	await page.route("**/v1/billing/orders/test-alipay", (route) => route.fulfill({ json: order }));
	await page.goto("/me/quota");
	await page.getByRole("button", { name: "购买额度" }).click();
	await page.getByRole("button", { name: "支付宝", exact: true }).click();
	const open = page.getByRole("button", { name: "打开支付宝收银台" });
	await expect(open).toBeVisible();
	expect(await opens()).toEqual([]);
	await open.click();
	await expect.poll(opens).toEqual([alipayUrl]);
	expect(page.context().pages()).toHaveLength(1);
});

test("old backend keeps phone sign-in and hides the new entrypoints", async ({ page }) => {
	await isolateCommerce(page);
	const refresh = "**/v1/auth/refresh";
	const signedOut = (route: Route) => route.fulfill({ status: 401, json: {} });
	await page.route(refresh, signedOut);
	await page.route("**/v1/auth/wechat/web/config", (route) => route.fulfill({ status: 404, json: {} }));
	await page.route("**/v1/billing/catalog", (route) => route.fulfill({ status: 404, json: {} }));
	const config = page.waitForResponse("**/v1/auth/wechat/web/config");
	await page.goto("/sign-in");
	expect((await config).status()).toBe(404);
	await page.getByRole("button", { name: "用密码登录" }).click();
	await expect(page.getByRole("button", { name: "用验证码登录" })).toBeVisible();
	await expect(page.getByRole("button", { name: "微信登录" })).toHaveCount(0);
	await page.unroute(refresh, signedOut);
	await page.goto("/me/account");
	await expect(page.getByRole("heading", { name: "登录方式" })).toBeVisible();
	await expect(page.getByRole("button", { name: "绑定微信" })).toHaveCount(0);
	const catalog = page.waitForResponse("**/v1/billing/catalog");
	await page.goto("/me/quota");
	expect((await catalog).status()).toBe(404);
	await expect(page.getByRole("heading", { name: "额度", exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "购买额度" })).toHaveCount(0);
});

for (const userAgent of ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "Mozilla/5.0 (Linux; Android 15)"]) {
	test(`mobile shell suppresses commerce even when enabled (${userAgent})`, async ({ page }) => {
		await isolateCommerce(page);
		await mockShell(page, userAgent);
		let calls = 0;
		await page.route("**/v1/auth/wechat/web/config", (route) => {
			calls++;
			return route.fulfill({ json: { enabled: true } });
		});
		await page.route("**/v1/billing/catalog", (route) => {
			calls++;
			return route.fulfill({ json: { products: [product] } });
		});
		await page.goto("/me/account");
		await expect(page.getByRole("heading", { name: "登录方式" })).toBeVisible();
		await expect(page.getByRole("button", { name: "绑定微信" })).toHaveCount(0);
		await page.goto("/me/quota");
		await expect(page.getByRole("heading", { name: "额度", exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "购买额度" })).toHaveCount(0);
		expect(calls).toBe(0);
	});
}
