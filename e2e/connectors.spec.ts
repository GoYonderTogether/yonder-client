import { expect, type Page, test, type WebSocketRoute } from "@playwright/test";
import type { ConnectorCommand, ConnectorDefinition, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { isolateChat } from "./chat-fixture.ts";

const catalog: ConnectorDefinition[] = (["local-files", "computer-control"] as const).map((id) => ({
	id,
	name: id,
	description: id,
	kind: "device",
	platforms: ["macos", "windows", "linux"],
}));

function device(id: string, name: string, platform: DeviceSummary["platform"], current = false): DeviceSummary {
	return { id, name, platform, current, status: "online", lastSeenAt: "2026-11-19T00:00:00Z", appVersion: "0.3.0" };
}

const browser = device("web", "Chrome", "web", true);
const phone = device("ios", "iPhone", "ios");
const mac = device("mac", "MacBook Pro", "macos");
const work = device("work", "工作室的桌面电脑", "windows");
const home = device("home", "家用工作站桌面电脑", "windows");

async function openConnectors(page: Page, items: DeviceSummary[]) {
	await isolateChat(page);
	await page.route(
		(url) => url.pathname === "/v1/connectors/catalog",
		(route) => route.fulfill({ json: { items: catalog } }),
	);
	await page.route("**/v1/devices", (route) => route.fulfill({ json: { items } }));
	await page.goto("/me/connectors");
}

test("shows only signed-in devices supported by the connector catalog", async ({ page }, info) => {
	await openConnectors(page, [browser, phone, mac]);
	const nav = page.getByRole("navigation", { name: "设备" });
	await expect(nav.getByRole("link")).toHaveText([mac.name]);
	await expect(nav.getByRole("link", { name: mac.name })).toHaveAttribute("aria-current", "true");
	await expect(
		page
			.getByRole("region", { name: mac.name })
			.getByRole("button", { name: /读取文件/ })
			.first(),
	).toBeVisible();
	await expect(page.getByRole("region", { name: /Chrome|iPhone/ })).toHaveCount(0);
	await page.screenshot({ path: info.outputPath("connectors-supported-devices.png") });
});

test("scrolling and device links keep the same selected group on a narrow screen", async ({ page }, info) => {
	await page.setViewportSize({ width: 390, height: 450 });
	await openConnectors(page, [browser, mac, work, home, phone]);
	const nav = page.getByRole("navigation", { name: "设备" });
	const link = (entry: DeviceSummary) => nav.getByRole("link", { name: entry.name });
	await expect(link(mac)).toHaveAttribute("aria-current", "true");
	const middle = page.getByRole("region", { name: work.name });
	const distance = await middle.evaluate((section) => {
		const frame = section.closest("[data-frame-scroll]");
		if (!frame) throw new Error("Missing settings scroll container");
		return Math.ceil(section.getBoundingClientRect().top - frame.getBoundingClientRect().top);
	});
	await page.mouse.move(195, 300);
	await page.mouse.wheel(0, distance);
	await expect(link(work)).toHaveAttribute("aria-current", "true");
	await page.mouse.wheel(0, 1000);
	await expect(link(home)).toHaveAttribute("aria-current", "true");
	await expect.poll(() => nav.evaluate((bar) => bar.scrollLeft)).toBeGreaterThan(0);
	await page.screenshot({ path: info.outputPath("connectors-scroll-selected.png") });
	await page.mouse.wheel(0, -1000);
	await expect(link(mac)).toHaveAttribute("aria-current", "true");
	await link(work).click();
	await expect(middle).toBeFocused();
	await expect(link(work)).toHaveAttribute("aria-current", "true");
	await expect(nav.getByRole("link")).toHaveText([mac.name, work.name, home.name]);
	await expect(page).toHaveURL(/\/me\/connectors$/);
});

test("device clicks select each group even when scroll targets coincide", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 520 });
	await openConnectors(page, [browser, mac, work, home, phone]);
	const nav = page.getByRole("navigation", { name: "设备" });
	const link = (entry: DeviceSummary) => nav.getByRole("link", { name: entry.name });
	await expect(link(mac)).toHaveAttribute("aria-current", "true");
	await link(work).click();
	await expect(link(work)).toHaveAttribute("aria-current", "true");
	const top = () =>
		nav.evaluate((bar) => {
			const frame = bar.closest("[data-frame-scroll]");
			if (!frame) throw new Error("Missing settings scroll container");
			return frame.scrollTop;
		});
	const middleTop = await top();
	expect(middleTop).toBeGreaterThan(0);
	const max = await nav.evaluate((bar) => {
		const frame = bar.closest("[data-frame-scroll]");
		if (!frame) throw new Error("Missing settings scroll container");
		return frame.scrollHeight - frame.clientHeight;
	});
	expect(middleTop).toBe(max);
	await link(home).click();
	await expect(link(home)).toHaveAttribute("aria-current", "true");
	expect(await top()).toBe(middleTop);
	await expect(page.getByRole("region", { name: home.name })).toBeFocused();
	await link(work).click();
	await expect(link(work)).toHaveAttribute("aria-current", "true");
	await expect(page.getByRole("region", { name: work.name })).toBeFocused();
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect.poll(top).toBe(0);
	await link(home).click();
	await expect(link(home)).toHaveAttribute("aria-current", "true");
	expect(await top()).toBe(0);
});

for (const { platform, dark } of [
	{ platform: "ios", dark: false },
	{ platform: "ios", dark: true },
	{ platform: "macos", dark: false },
] as const) {
	test(`${platform} ${dark ? "dark " : ""}connector overview and selected-device sheet`, async ({ page }, info) => {
		const chat = await isolateChat(page, { items: [], dark });
		const isMac = platform === "macos";
		const connector = isMac ? "apple-calendar" : "apple-photos";
		const name = isMac ? "Apple 日历" : "Apple 相册";
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: isMac ? 1180 : 390, height: 770 });
		const target = device("dev_apple", isMac ? "MacBook Pro" : "iPhone", platform, true);
		const remoteMac = device("dev_source", "Studio Mac", "macos");
		let remoteOnline = false;
		const instance: ConnectorInstance = {
			id: "con_apple",
			connectorId: connector,
			deviceId: target.id,
			deviceName: target.name,
			name: target.name,
			currentDevice: true,
			scope: "device",
			capabilities: { fileTools: false },
			revision: 1,
			status: "offline",
			createdAt: "2026-11-21T00:00:00Z",
		};
		const remoteSources: ConnectorInstance[] = isMac
			? []
			: [
					{
						...instance,
						id: "con_mac_photos",
						deviceId: remoteMac.id,
						deviceName: remoteMac.name,
						currentDevice: false,
						status: "online",
					},
					{
						...instance,
						id: "con_notes",
						connectorId: "apple-notes",
						deviceId: remoteMac.id,
						deviceName: remoteMac.name,
						currentDevice: false,
					},
					{
						...instance,
						id: "con_voice",
						connectorId: "apple-voice-memos",
						deviceId: remoteMac.id,
						deviceName: remoteMac.name,
						currentDevice: false,
					},
				];
		await page.route("**/v1/devices", (route) =>
			route.fulfill({
				json: { items: isMac ? [target] : [target, { ...remoteMac, status: remoteOnline ? "online" : "offline" }] },
			}),
		);
		await page.route("**/v1/me/sessions", (route) =>
			route.fulfill({ json: { items: [{ id: "ses_iphone", current: true }] } }),
		);
		await page.route(
			(url) => url.pathname === "/v1/connectors/catalog",
			(route) => {
				expect(new URL(route.request().url()).searchParams.get("apple")).toBe("2");
				const items: ConnectorDefinition[] = [
					{
						id: "apple-calendar",
						name: "Apple Calendar",
						description: "",
						kind: "device",
						platforms: ["ios", "macos"],
					},
					{ id: "apple-photos", name: "Apple Photos", description: "", kind: "device", platforms: ["ios", "macos"] },
					{ id: "apple-notes", name: "Apple Notes", description: "", kind: "device", platforms: ["macos"] },
					{ id: "apple-voice-memos", name: "Apple Voice Memos", description: "", kind: "device", platforms: ["macos"] },
				];
				return route.fulfill({ json: { items } });
			},
		);
		let created = 0;
		let current: ConnectorInstance | undefined;
		await page.route(
			(url) => url.pathname === "/v1/connectors",
			(route) => {
				if (route.request().method() === "POST") {
					created++;
					expect(route.request().postDataJSON()).toMatchObject({
						connectorId: instance.connectorId,
						deviceId: target.id,
					});
					current = instance;
					return route.fulfill({ json: current });
				}
				return route.fulfill({ json: { items: current ? [current, ...remoteSources] : remoteSources } });
			},
		);
		await page.route("**/v1/connectors/con_calendar", (route) => {
			expect(route.request().method()).toBe("DELETE");
			current = undefined;
			return route.fulfill({ json: { ok: true } });
		});
		let socket: WebSocketRoute | undefined;
		let ready = false;
		await page.routeWebSocket("**/v1/realtime*", (connection) => {
			socket = connection;
			connection.onMessage((raw) => {
				const body = JSON.parse(String(raw));
				if (body.type !== "connector.ready") return;
				const next = body.connections.some(
					({ id, revision }: { id: string; revision: number }) => id === instance.id && revision === instance.revision,
				);
				if (next === ready) return;
				ready = next;
				if (current) current = { ...current, status: ready ? "online" : "offline" };
				connection.send(
					JSON.stringify({ type: "connectors.changed", eventId: crypto.randomUUID(), at: new Date().toISOString() }),
				);
			});
		});
		await page.addInitScript((isMac) => {
			Object.defineProperty(navigator, "userAgent", {
				value: isMac
					? "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)"
					: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
			});
			localStorage.setItem("dev.yonder.desktop.refresh-token", "apple-connector-browser-fixture");
			let finishPermission: ((allowed: boolean) => void) | undefined;
			let system: "undetermined" | "denied" | "limited" | "granted" = "undetermined";
			let authorized = false;
			const actions: string[] = [];
			Object.assign(window, {
				appleConnectorFixture: {
					actions,
					resolvePermission: (allowed: boolean) => finishPermission?.(allowed),
					allowInSettings: () => {
						system = isMac ? "granted" : "limited";
						window.dispatchEvent(new Event("focus"));
					},
				},
				__TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
				__TAURI_INTERNALS__: {
					metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
					transformCallback: () => 1,
					unregisterCallback() {},
					invoke: async (command: string, args: { connections?: unknown[] }) => {
						if (command === "get_desktop_refresh_token") return "apple-connector-browser-fixture";
						if (!command.startsWith("plugin:yonder-apple-resources|")) return null;
						const action = command.split("|")[1];
						if (action === "statuses")
							return {
								"apple-calendar": isMac ? system : "undetermined",
								"apple-photos": isMac ? "undetermined" : system,
								"apple-notes": isMac ? "undetermined" : "unsupported",
								"apple-voice-memos": isMac ? "undetermined" : "unsupported",
							};
						if (action === "request_permission") {
							actions.push(action);
							const granted = await new Promise<boolean>((resolve) => {
								finishPermission = resolve;
							});
							system = granted ? "granted" : "denied";
							return system;
						}
						if (action === "open_settings") {
							actions.push(action);
						}
						if (action === "authorize") {
							actions.push(action);
							authorized = true;
						}
						if (action === "ready") return authorized ? (args.connections ?? []) : [];
						if (action === "revoke") {
							actions.push(action);
							authorized = false;
						}
						if (action === "execute") {
							actions.push(action);
							return isMac
								? { kind: "apple_calendar_list", events: [], more: false }
								: { kind: "apple_photos_list", photos: [], more: false };
						}
						return null;
					},
				},
			});
		}, isMac);
		const actions = () =>
			page.evaluate(
				() => (window as unknown as { appleConnectorFixture: { actions: string[] } }).appleConnectorFixture.actions,
			);
		const permission = (allowed: boolean) =>
			page.evaluate(
				(value) =>
					(
						window as unknown as { appleConnectorFixture: { resolvePermission(allowed: boolean): void } }
					).appleConnectorFixture.resolvePermission(value),
				allowed,
			);
		await page.goto("/me/connectors");
		if (isMac) await page.getByRole("button", { name: "继续使用 Yonder" }).click();
		const currentDevice = page.getByRole("region", { name: `${target.name} · 这台设备` });
		await expect(currentDevice.getByText("Apple 相册", { exact: true })).toBeVisible();
		await expect(currentDevice.getByText("Apple 备忘录", { exact: true })).toHaveCount(isMac ? 1 : 0);
		await expect(currentDevice.getByText("Apple 语音备忘录", { exact: true })).toHaveCount(isMac ? 1 : 0);
		if (!isMac && !dark) {
			await expect(page.getByRole("radio", { name: /按设备|按连接器/ })).toHaveCount(0);
			await expect(page.getByRole("navigation", { name: "设备" })).toBeVisible();
			await page.screenshot({ path: info.outputPath("01-device-overview.png"), animations: "disabled" });
		}
		const selection = page.getByRole("button", { name: `连接 · ${name}`, exact: true });
		await expect(selection.locator("svg.lucide-plus")).toBeVisible();
		const dialog = page.getByRole("dialog", { name });
		const authorize = dialog.getByRole("button", { name: "连接", exact: true });
		const trial = dialog.getByRole("button", { name: "试试看" });
		const chooseMac = () => dialog.getByText("Studio Mac", { exact: true }).click();
		const choosePhone = () => dialog.getByText("iPhone", { exact: true }).click();
		await selection.click();
		await expect(authorize).toBeVisible();
		await expect(dialog.getByRole("button")).toHaveCount(2);
		await expect(dialog.locator("details, form, input:not([type=radio])")).toHaveCount(0);
		expect(await actions()).toEqual([]);
		if (dark) {
			const bounds = await dialog.boundingBox();
			expect(bounds?.height).toBeCloseTo(770 * 0.8, 0);
			await page.screenshot({ path: info.outputPath("07-dark-sheet.png"), animations: "disabled" });
			return;
		}
		if (isMac) {
			expect((await dialog.boundingBox())?.width).toBeLessThan(1100);
		}
		if (!isMac) {
			const bounds = await dialog.boundingBox();
			expect(bounds?.height).toBeCloseTo(770 * 0.8, 0);
			await expect(dialog.getByRole("radio", { name: /iPhone/ })).toBeChecked();
			await expect(dialog.getByRole("radio", { name: /Studio Mac/ })).toHaveCount(1);
			await page.screenshot({ path: info.outputPath("02-connect-hero.png"), animations: "disabled" });
			await chooseMac();
			await expect(dialog.getByRole("radio", { name: /Studio Mac/ })).toBeChecked();
			await expect(authorize).toBeDisabled();
			await expect(trial).toHaveCount(0);
			expect(await actions()).toEqual([]);
			expect(created).toBe(0);
			remoteOnline = true;
			await page.reload();
			await selection.click();
		}
		await authorize.click();
		await expect.poll(actions).toEqual(["request_permission"]);
		expect(created).toBe(0);
		await permission(false);
		await expect(dialog.getByRole("status")).toHaveText("请在系统设置中允许访问。");
		const settings = authorize;
		await expect(settings).toBeVisible();
		await expect(dialog.getByRole("button")).toHaveCount(2);
		expect(created).toBe(0);
		if (!isMac) await page.screenshot({ path: info.outputPath("03-connect-denied.png"), animations: "disabled" });
		await settings.click();
		await expect.poll(actions).toEqual(["request_permission", "open_settings"]);
		await page.evaluate(() => window.dispatchEvent(new Event("focus")));
		await expect(settings).toBeVisible();
		expect(created).toBe(0);
		await page.evaluate(() =>
			(
				window as unknown as { appleConnectorFixture: { allowInSettings: () => void } }
			).appleConnectorFixture.allowInSettings(),
		);
		await expect(dialog.getByRole("status")).toHaveText(isMac ? "已授权" : "已授权 · 仅系统允许的内容");
		await expect(trial).toBeVisible();
		await expect(dialog.getByRole("button")).toHaveCount(2);
		expect(created).toBe(1);
		await expect.poll(() => ready).toBe(true);
		expect(await actions()).toEqual(["request_permission", "open_settings", "authorize"]);
		if (!isMac) {
			await page.screenshot({ path: info.outputPath("04-iphone-limited.png"), animations: "disabled" });
			await chooseMac();
			await expect(dialog.getByRole("radio", { name: /Studio Mac/ })).toBeChecked();
			await expect(trial).toBeVisible();
			await expect(dialog.getByRole("status")).toHaveText("已授权");
			await page.screenshot({ path: info.outputPath("05-mac-selected-ready.png"), animations: "disabled" });
			await choosePhone();
			await expect(dialog.getByRole("status")).toHaveText("已授权 · 仅系统允许的内容");
		}
		await dialog.getByRole("button", { name: "关闭" }).click();
		await expect(dialog).toBeHidden();
		await expect(currentDevice.getByRole("button", { name: `已接入 · ${name}`, exact: true })).toBeVisible();

		const command: ConnectorCommand = {
			connectionId: instance.id,
			deviceId: instance.deviceId,
			connectorId: instance.connectorId,
			scope: instance.scope,
			capabilities: instance.capabilities,
			revision: instance.revision,
			id: "cmd_calendar",
			operation: isMac ? "apple_calendar_list" : "apple_photos_list",
			path: "",
			args: isMac ? { dateFrom: "2026-11-21", dateTo: "2026-11-21" } : {},
			expiresAt: new Date(Date.now() + 20_000).toISOString(),
		};
		await page.route("**/v1/connector-commands/cmd_calendar/result", (route) => route.fulfill({ json: { ok: true } }));
		const result = page.waitForRequest("**/v1/connector-commands/cmd_calendar/result");
		socket?.send(
			JSON.stringify({
				type: "connector.command",
				command,
				eventId: crypto.randomUUID(),
				at: new Date().toISOString(),
			}),
		);
		expect((await result).postDataJSON()).toEqual({
			ok: true,
			result: isMac
				? { kind: "apple_calendar_list", events: [], more: false }
				: { kind: "apple_photos_list", photos: [], more: false },
		});
		expect(await actions()).toEqual(["request_permission", "open_settings", "authorize", "execute"]);
		if (!isMac) {
			const connected = currentDevice.getByRole("button", { name: `已接入 · ${name}`, exact: true });
			await connected.click();
			await chooseMac();
			await trial.click();
			await expect(page).toHaveURL(/\/messages\/main$/);
			const composer = page.locator("textarea");
			await expect(composer).toHaveValue(/只用「Studio Mac」.*不要用其他设备/);
			expect(chat.sent).toEqual([]);
			await page.screenshot({ path: info.outputPath("06-selected-device-draft.png"), animations: "disabled" });
			await composer.fill("保留我没有发送的内容。");
			await page.goBack();
			await connected.click();
			await choosePhone();
			await trial.click();
			await expect(composer).toHaveValue("保留我没有发送的内容。");
			expect(chat.sent).toEqual([]);
			expect(await actions()).toEqual(["request_permission", "open_settings", "authorize", "execute"]);
		}
	});
}
