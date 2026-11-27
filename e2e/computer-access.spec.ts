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
					capabilities: { fileTools: false },
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
	await page.getByRole("button", { name: "继续使用 Yonder" }).click();

	await page
		.getByRole("region", { name: /MacBook Pro/ })
		.getByRole("button", { name: "电脑接管" })
		.click();
	const panel = page.getByRole("dialog", { name: "电脑接管" });
	const read = panel.getByRole("checkbox", { name: "读取文件" });
	const write = panel.getByRole("checkbox", { name: "修改文件" });
	await expect(read).toBeEnabled();
	await expect(read).not.toBeChecked();
	await expect(write).not.toBeChecked();
	await read.check();
	await panel.getByRole("button", { name: "应用授权" }).click();
	const fileCalls = () => page.evaluate(() => Reflect.get(window, "fileCalls") as string[]);
	await expect.poll(fileCalls).toEqual(["local_files_authorize"]);
	await expect(read).toBeChecked();
	await expect(write).not.toBeChecked();
	await expect(panel.getByRole("button", { name: "应用授权" })).toBeDisabled();
	await page.screenshot({ path: info.outputPath("computer-permissions-mac.png"), animations: "disabled" });
	await read.uncheck();
	await panel.getByRole("button", { name: "应用授权" }).click();
	await expect.poll(fileCalls).toEqual(["local_files_authorize", "local_files_revoke"]);
	await expect(panel.getByRole("button", { name: "应用授权" })).toBeDisabled();
	await expect(read).not.toBeChecked();
});
