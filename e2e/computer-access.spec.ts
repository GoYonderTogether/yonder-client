import { expect, test } from "@playwright/test";
import type { ConnectorDefinition, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
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

const mac = device("mac", "MacBook Pro", "macos");
const work = device("work", "工作室的桌面电脑", "windows");

test("computer access only changes the selected device and permission", async ({ page }, info) => {
	await page.setViewportSize({ width: 1180, height: 770 });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await isolateChat(page, { items: [] });
	const target = { ...mac, current: true };
	await page.route(
		(url) => url.pathname === "/v1/connectors/catalog",
		(route) => route.fulfill({ json: { items: catalog } }),
	);
	await page.route("**/v1/devices", (route) => route.fulfill({ json: { items: [target, work] } }));
	await page.route("**/v1/me/sessions", (route) =>
		route.fulfill({ json: { items: [{ id: "ses_local", current: true }] } }),
	);
	let grant: ConnectorInstance | undefined;
	await page.route(
		(url) => url.pathname === "/v1/connectors",
		(route) => {
			if (route.request().method() === "POST") {
				const input = route.request().postDataJSON();
				expect(input).toEqual({
					deviceId: target.id,
					connectorId: "local-files",
					name: target.name,
					scope: "device",
					capabilities: { fileTools: false, terminal: false, desktop: false },
				});
				grant = {
					...input,
					id: "con_read",
					deviceName: target.name,
					currentDevice: true,
					revision: 1,
					status: "online",
					createdAt: new Date().toISOString(),
				};
				return route.fulfill({ json: grant });
			}
			return route.fulfill({ json: { items: grant ? [grant] : [] } });
		},
	);
	await page.route("**/v1/connectors/con_read", (route) => {
		expect(route.request().method()).toBe("DELETE");
		grant = undefined;
		return route.fulfill({ json: { ok: true } });
	});
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)" });
		localStorage.setItem("dev.yonder.desktop.refresh-token", "computer-access-browser-fixture");

		const fileCalls: string[] = [];
		Object.assign(window, {
			fileCalls,
			__TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
			__TAURI_INTERNALS__: {
				metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
				transformCallback: () => 1,
				unregisterCallback() {},
				invoke: async (command: string) => {
					if (command === "get_desktop_refresh_token") return "computer-access-browser-fixture";
					if (command === "local_files_ready") return [];
					if (command === "local_files_authorize" || command === "local_files_revoke") fileCalls.push(command);
					return null;
				},
			},
		});
	});
	await page.goto("/me/connectors");

	await page
		.getByRole("region", { name: /MacBook Pro/ })
		.getByRole("button", { name: "连接 · 电脑接管" })
		.click();
	const panel = page.getByRole("dialog", { name: "电脑接管" });
	const master = panel.getByRole("switch", { name: target.name, exact: true });
	await expect(master).toHaveAttribute("aria-checked", "false");
	await expect(panel.getByRole("checkbox")).toHaveCount(0);
	await panel.getByRole("button", { name: /MacBook Pro/ }).click();
	const read = panel.getByRole("switch", { name: /读取文件/ });
	const write = panel.getByRole("switch", { name: /修改文件/ });
	await expect(read).toBeEnabled();
	await expect(read).not.toBeChecked();
	await expect(write).not.toBeChecked();
	await read.click();
	const fileCalls = () => page.evaluate(() => Reflect.get(window, "fileCalls") as string[]);
	await expect.poll(fileCalls).toEqual(["local_files_authorize"]);
	await expect(read).toBeChecked();
	await expect(write).not.toBeChecked();
	await expect(master).toHaveAttribute("aria-checked", "mixed");
	await page.screenshot({ path: info.outputPath("computer-permissions-mac.png"), animations: "disabled" });
	await read.click();
	await expect.poll(fileCalls).toEqual(["local_files_authorize", "local_files_revoke"]);
	await expect(read).not.toBeChecked();
	await expect(master).toHaveAttribute("aria-checked", "false");
});

test("the terminal is its own switch: a full warning, no master sweep, and a capability-only change", async ({
	page,
}, info) => {
	await page.setViewportSize({ width: 1180, height: 770 });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await isolateChat(page, { items: [] });
	const target = { ...mac, current: true };
	await page.route(
		(url) => url.pathname === "/v1/connectors/catalog",
		(route) => route.fulfill({ json: { items: catalog } }),
	);
	await page.route("**/v1/devices", (route) => route.fulfill({ json: { items: [target] } }));
	await page.route("**/v1/me/sessions", (route) =>
		route.fulfill({ json: { items: [{ id: "ses_local", current: true }] } }),
	);
	// The device already granted both file capabilities; `terminal` starts off.
	const write: ConnectorInstance = {
		id: "con_write",
		connectorId: "computer-control",
		deviceId: target.id,
		deviceName: target.name,
		name: target.name,
		scope: "device",
		capabilities: { fileTools: true, terminal: false },
		revision: 1,
		status: "online",
		currentDevice: true,
		createdAt: "2026-11-28T00:00:00Z",
	};
	const read: ConnectorInstance = {
		...write,
		id: "con_read",
		connectorId: "local-files",
		capabilities: { fileTools: false, terminal: false },
	};
	let items = [read, write];
	const patches: unknown[] = [];
	await page.route(
		(url) => url.pathname === "/v1/connectors",
		(route) => route.fulfill({ json: { items } }),
	);
	await page.route("**/v1/connectors/con_write", async (route) => {
		expect(route.request().method()).toBe("PATCH");
		const body = route.request().postDataJSON();
		patches.push(body);
		items = items.map((item) =>
			item.id === "con_write" ? { ...item, revision: item.revision + 1, capabilities: body.capabilities } : item,
		);
		return route.fulfill({ json: items.find((item) => item.id === "con_write") });
	});
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)" });
		localStorage.setItem("dev.yonder.desktop.refresh-token", "terminal-browser-fixture");
		const fileCalls: string[] = [];
		Object.assign(window, {
			fileCalls,
			__TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
			__TAURI_INTERNALS__: {
				metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
				transformCallback: () => 1,
				unregisterCallback() {},
				invoke: async (command: string) => {
					if (command === "get_desktop_refresh_token") return "terminal-browser-fixture";
					if (command === "local_files_ready") return [];
					if (command === "local_files_authorize" || command === "local_files_revoke") fileCalls.push(command);
					return null;
				},
			},
		});
	});
	await page.goto("/me/connectors");
	await page
		.getByRole("region", { name: /MacBook Pro/ })
		.getByRole("button", { name: "已接入 · 电脑接管" })
		.click();
	const panel = page.getByRole("dialog", { name: "电脑接管" });
	await panel.getByRole("button", { name: /MacBook Pro/ }).click();
	const terminal = panel.getByRole("switch", { name: "终端" });
	await expect(terminal).not.toBeChecked();
	await expect(panel.getByText("Bot 可以在这台设备上以你的系统账号运行任意命令，包括删除文件和联网。")).toBeVisible();
	await page.screenshot({ path: info.outputPath("terminal-member-off.png"), animations: "disabled" });
	await terminal.click();
	await expect
		.poll(() => patches)
		.toEqual([{ expectedRevision: 1, capabilities: { fileTools: true, terminal: true } }]);
	await expect(terminal).toBeChecked();
	// A capability change on the same connection: no new grant, no revocation.
	await expect
		.poll(() => page.evaluate(() => Reflect.get(window, "fileCalls") as string[]))
		.toEqual(["local_files_authorize"]);
	await page.screenshot({ path: info.outputPath("terminal-member-on.png"), animations: "disabled" });
	await terminal.click();
	await expect
		.poll(() => patches)
		.toEqual([
			{ expectedRevision: 1, capabilities: { fileTools: true, terminal: true } },
			{ expectedRevision: 2, capabilities: { fileTools: true, terminal: false } },
		]);
	await expect(terminal).not.toBeChecked();
});
