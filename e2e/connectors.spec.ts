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
const home = { ...device("home", "家用工作站桌面电脑", "windows"), status: "offline" as const };

function grant(id: string, connectorId: ConnectorInstance["connectorId"], on: DeviceSummary): ConnectorInstance {
	return {
		id,
		connectorId,
		deviceId: on.id,
		deviceName: on.name,
		name: on.name,
		scope: "device",
		capabilities: { fileTools: connectorId === "computer-control", terminal: false },
		revision: 1,
		status: on.status,
		currentDevice: false,
		createdAt: "2026-11-27T00:00:00Z",
	};
}

async function openConnectors(page: Page, items: DeviceSummary[], grants: ConnectorInstance[] = []) {
	await isolateChat(page);
	await page.route(
		(url) => url.pathname === "/v1/connectors/catalog",
		(route) => route.fulfill({ json: { items: catalog } }),
	);
	await page.route(
		(url) => url.pathname === "/v1/connectors",
		(route) => route.fulfill({ json: { items: grants } }),
	);
	await page.route("**/v1/devices", (route) => route.fulfill({ json: { items } }));
	await page.goto("/me/connectors");
}

test("system tabs list only supported systems, then adding a device", async ({ page }, info) => {
	await openConnectors(page, [browser, phone, mac]);
	const nav = page.getByRole("navigation", { name: "设备" });
	await expect(nav.getByRole("button")).toHaveText(["macOS", "连接其他设备"]);
	await expect(nav.getByRole("button", { name: "macOS" })).toHaveAttribute("aria-current", "true");
	const section = page.getByRole("region", { name: mac.name });
	await expect(section.getByRole("button", { name: "连接 · 电脑接管" })).toBeVisible();
	await expect(section.getByRole("button", { name: /读取文件|修改文件/ })).toHaveCount(0);
	await expect(page.getByRole("region", { name: /Chrome|iPhone/ })).toHaveCount(0);
	await page.screenshot({ path: info.outputPath("connectors-overview.png") });
});

test("a system tab jumps to the first device of that system on a narrow screen", async ({ page }, info) => {
	await page.setViewportSize({ width: 390, height: 450 });
	await openConnectors(page, [browser, mac, work, home, phone]);
	const nav = page.getByRole("navigation", { name: "设备" });
	await expect(nav.getByRole("button")).toHaveText(["macOS", "Windows", "连接其他设备"]);
	await nav.getByRole("button", { name: "Windows" }).click();
	await expect(page.getByRole("region", { name: work.name })).toBeFocused();
	await expect(nav.getByRole("button", { name: "Windows" })).toHaveAttribute("aria-current", "true");
	await expect(page).toHaveURL(/\/me\/connectors$/);
	await page.screenshot({ path: info.outputPath("connectors-narrow-tabs.png") });
});

test("computer access: master switch per device, expandable capability switches, offline greyed", async ({
	page,
}, info) => {
	let removed: string[] = [];
	await openConnectors(
		page,
		[browser, mac, work, home],
		[
			grant("con_read", "local-files", mac),
			grant("con_home", "local-files", home),
			grant("con_home_w", "computer-control", home),
		],
	);
	// Registered after the chat fixture so this route, not its catch-all, answers the removal.
	await page.route(/\/v1\/connectors\/con_/, (route) => {
		removed = [...removed, route.request().url().split("/").at(-1) ?? ""];
		return route.fulfill({ json: { ok: true } });
	});
	await expect(page.getByRole("region", { name: home.name }).getByText(/离线/)).toBeVisible();
	await expect(page.getByRole("button", { name: "已接入 · 设备离线 · 电脑接管" })).toBeVisible();
	await page.getByRole("region", { name: mac.name }).getByRole("button", { name: "已接入 · 电脑接管" }).click();
	const dialog = page.getByRole("dialog", { name: "电脑接管" });
	const master = dialog.getByRole("switch", { name: mac.name, exact: true });
	await expect(master).toHaveAttribute("aria-checked", "mixed");
	await expect(dialog.getByRole("switch", { name: "读取文件" })).toHaveCount(0);
	await dialog.getByRole("button", { name: new RegExp(mac.name) }).click();
	await expect(dialog.getByRole("switch", { name: /读取文件/ })).toBeChecked();
	await expect(dialog.getByRole("switch", { name: /修改文件/ })).not.toBeChecked();
	await expect(dialog.getByRole("switch", { name: /修改文件/ })).toBeDisabled();
	await expect(dialog.getByRole("switch", { name: home.name, exact: true })).toBeChecked();
	await expect(dialog.getByRole("checkbox")).toHaveCount(0);
	await page.screenshot({ path: info.outputPath("computer-access-sheet.png") });
	await master.click();
	await expect.poll(() => removed).toEqual(["con_read"]);
});

for (const platform of ["macos", "ios"] as const) {
	test(`${platform} Apple connector: system permission, switch on, run a command, switch off`, async ({
		page,
	}, info) => {
		await isolateChat(page, { items: [] });
		const isMac = platform === "macos";
		const connector = isMac ? "apple-calendar" : "apple-photos";
		const name = isMac ? "Apple 日历" : "Apple 相册";
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: isMac ? 1180 : 390, height: 770 });
		const target = device("dev_apple", isMac ? "MacBook Pro" : "iPhone", platform, true);
		const instance: ConnectorInstance = {
			...grant("con_apple", connector, target),
			capabilities: { fileTools: false, terminal: false },
			currentDevice: true,
			status: "offline",
		};
		await page.route("**/v1/devices", (route) => route.fulfill({ json: { items: [target] } }));
		await page.route("**/v1/me/sessions", (route) =>
			route.fulfill({ json: { items: [{ id: "ses_apple", current: true }] } }),
		);
		await page.route(
			(url) => url.pathname === "/v1/connectors/catalog",
			(route) => {
				const items: ConnectorDefinition[] = [
					{ id: "apple-calendar", name: "", description: "", kind: "device", platforms: ["ios", "macos"] },
					{ id: "apple-photos", name: "", description: "", kind: "device", platforms: ["ios", "macos"] },
					{ id: "apple-notes", name: "", description: "", kind: "device", platforms: ["macos"] },
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
					expect(route.request().postDataJSON()).toMatchObject({ connectorId: connector, deviceId: target.id });
					current = instance;
					return route.fulfill({ json: current });
				}
				return route.fulfill({ json: { items: current ? [current] : [] } });
			},
		);
		await page.route(`**/v1/connectors/${instance.id}`, (route) => {
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
				const next = body.connections.some(({ id }: { id: string }) => id === instance.id);
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
			let system = "undetermined";
			let authorized = false;
			const actions: string[] = [];
			Object.assign(window, {
				appleConnectorFixture: {
					actions,
					resolvePermission: (allowed: boolean) => finishPermission?.(allowed),
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
								"apple-voice-memos": "unsupported",
							};
						if (action === "request_permission") {
							actions.push(action);
							const granted = await new Promise<boolean>((resolve) => {
								finishPermission = resolve;
							});
							system = granted ? (isMac ? "granted" : "limited") : "denied";
							return system;
						}
						if (action === "open_settings" || action === "authorize" || action === "revoke" || action === "execute")
							actions.push(action);
						if (action === "authorize") authorized = true;
						if (action === "revoke") authorized = false;
						if (action === "ready") return authorized ? (args.connections ?? []) : [];
						if (action === "execute")
							return isMac
								? { kind: "apple_calendar_list", events: [], more: false }
								: { kind: "apple_photos_list", photos: [], more: false };
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
		const section = page.getByRole("region", { name: target.name });
		await expect(section.getByText("Apple 备忘录", { exact: true })).toHaveCount(isMac ? 1 : 0);
		await section.getByRole("button", { name: `连接 · ${name}`, exact: true }).click();
		const dialog = page.getByRole("dialog", { name });
		const toggle = dialog.getByRole("switch", { name: new RegExp(target.name) });
		await expect(toggle).not.toBeChecked();
		await expect(dialog.getByRole("checkbox")).toHaveCount(0);
		expect(await actions()).toEqual([]);
		await page.screenshot({ path: info.outputPath(`${platform}-apple-sheet.png`), animations: "disabled" });

		await toggle.click();
		await expect.poll(actions).toEqual(["request_permission"]);
		await permission(false);
		await expect(dialog.getByRole("alert")).toContainText("请到系统设置允许 Yonder 访问后重试。");
		expect(created).toBe(0);
		await dialog.getByRole("button", { name: "打开系统设置" }).click();
		await expect.poll(actions).toEqual(["request_permission", "open_settings"]);

		await toggle.click();
		await expect.poll(actions).toEqual(["request_permission", "open_settings", "request_permission"]);
		await permission(true);
		await expect(toggle).toBeChecked();
		expect(created).toBe(1);
		await expect.poll(() => ready).toBe(true);
		await expect(dialog.getByRole("button", { name: "试试看" })).toBeVisible();
		await page.screenshot({ path: info.outputPath(`${platform}-apple-on.png`), animations: "disabled" });
		await dialog.getByRole("button", { name: "关闭" }).click();
		await expect(section.getByRole("button", { name: `已接入 · ${name}`, exact: true })).toBeVisible();

		const command: ConnectorCommand = {
			connectionId: instance.id,
			deviceId: instance.deviceId,
			connectorId: instance.connectorId,
			scope: instance.scope,
			capabilities: instance.capabilities,
			revision: instance.revision,
			id: "cmd_apple",
			operation: isMac ? "apple_calendar_list" : "apple_photos_list",
			path: "",
			args: isMac ? { dateFrom: "2026-11-27", dateTo: "2026-11-27" } : {},
			expiresAt: new Date(Date.now() + 20_000).toISOString(),
		};
		await page.route("**/v1/connector-commands/cmd_apple/result", (route) => route.fulfill({ json: { ok: true } }));
		const result = page.waitForRequest("**/v1/connector-commands/cmd_apple/result");
		socket?.send(
			JSON.stringify({
				type: "connector.command",
				command,
				eventId: crypto.randomUUID(),
				at: new Date().toISOString(),
			}),
		);
		expect((await result).postDataJSON()).toMatchObject({ ok: true });

		await section.getByRole("button", { name: `已接入 · ${name}`, exact: true }).click();
		await toggle.click();
		await expect(section.getByRole("button", { name: `连接 · ${name}`, exact: true })).toBeVisible();
		await expect.poll(actions).toContain("revoke");
	});
}
