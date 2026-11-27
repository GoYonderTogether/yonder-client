import { expect, type Page, test } from "@playwright/test";
import { isolateChat } from "./chat-fixture.ts";

async function prepareMacPermissions(page: Page) {
	await isolateChat(page);
	await page.setViewportSize({ width: 1180, height: 760 });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.route("**/v1/devices", (route) =>
		route.fulfill({
			json: {
				items: [
					{ id: "current-mac", name: "MacBook", platform: "macos", status: "online", current: true },
					{ id: "other-mac", name: "Mac mini", platform: "macos", status: "offline", current: false },
				],
			},
		}),
	);
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)" });
		let microphone = "default";
		let notification = "denied";
		let login = "disabled";
		let closeBehavior = "tray";
		let nextCallback = 0;
		type RuntimeEvent = { event: string; id: number; payload: null };
		const callbacks = new Map<number, (event: RuntimeEvent) => void>();
		const focusListeners = new Set<number>();
		const settingsOpened: unknown[] = [];
		const permissionCommands: string[] = [];
		Object.assign(window, {
			settingsOpened,
			permissionCommands,
			focusListeners,
			returnFromSystemSettings(status: string) {
				microphone = status;
				for (const id of focusListeners) callbacks.get(id)?.({ event: "tauri://focus", id, payload: null });
			},
			__TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
			__TAURI_INTERNALS__: {
				metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
				transformCallback: (callback: (event: RuntimeEvent) => void) => {
					callbacks.set(++nextCallback, callback);
					return nextCallback;
				},
				unregisterCallback(id: number) {
					callbacks.delete(id);
				},
				invoke: async (command: string, args: Record<string, unknown>) => {
					if (command.startsWith("plugin:yonder-mac-permissions|")) permissionCommands.push(command);
					switch (command) {
						case "plugin:event|listen": {
							const id = Number(args.handler);
							const target = args.target as { kind: string; label?: string };
							if (args.event === "tauri://focus" && target.kind === "Window" && target.label === "main")
								focusListeners.add(id);
							return id;
						}
						case "plugin:event|unlisten":
							focusListeners.delete(Number(args.eventId));
							break;
						case "get_desktop_refresh_token":
							return "isolated-mac-permissions";
						case "plugin:yonder-mac-permissions|permission_status":
							return { microphone };
						case "plugin:yonder-mac-permissions|open_settings":
							settingsOpened.push(args.permission);
							break;
						case "plugin:yonder-mac-permissions|request_microphone":
							microphone = "granted";
							return true;
						case "plugin:yonder-mac-permissions|login_item_status":
							return login;
						case "plugin:yonder-mac-permissions|set_login_item":
							login = args.enabled ? "enabled" : "disabled";
							return login;
						case "plugin:yonder-notifications|permission_status":
							return notification;
						case "plugin:yonder-notifications|request_permission":
							notification = "granted";
							return true;
						case "get_desktop_close_behavior":
							return closeBehavior;
						case "set_desktop_close_behavior":
							closeBehavior = String(args.behavior);
							break;
					}
					return null;
				},
			},
		});
	});
}

test("Mac first login reaches the app without requesting broad permissions", async ({ page }) => {
	await prepareMacPermissions(page);
	await page.goto("/me/devices");
	await expect(page.getByRole("button", { name: "管理权限" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "设置这台电脑" })).toHaveCount(0);
	expect(await page.evaluate(() => (window as unknown as { permissionCommands: string[] }).permissionCommands)).toEqual(
		[],
	);
});

test("Mac device management uses OS settings and asks for microphone access on demand", async ({ page }, info) => {
	await prepareMacPermissions(page);
	await page.goto("/me/devices");
	const manage = page.getByRole("button", { name: "管理权限" });
	await expect(manage).toHaveCount(1);
	await manage.click();
	const modal = page.getByRole("dialog", { name: "管理权限" });
	await expect(modal.getByText(/完全磁盘访问|辅助功能/)).toHaveCount(0);
	await expect(modal.getByRole("button", { name: "允许麦克风" })).toBeVisible();
	await expect(modal.getByText("未允许")).toBeVisible();
	await modal.getByRole("button", { name: "打开系统设置" }).click();
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { settingsOpened: unknown[] }).settingsOpened))
		.toEqual(["notifications"]);
	await page.screenshot({ path: info.outputPath("mac-permissions-dialog.png") });
	await modal.getByRole("button", { name: "允许麦克风" }).click();
	await expect(modal.getByText("系统权限已开启")).toHaveCount(1);
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { focusListeners: Set<number> }).focusListeners.size))
		.toBe(1);
	await page.evaluate(() =>
		(window as unknown as { returnFromSystemSettings: (status: string) => void }).returnFromSystemSettings("denied"),
	);
	await expect(modal.getByText("未允许")).toHaveCount(2);
	await modal.getByRole("button", { name: "关闭" }).click();
	await expect(modal).toHaveCount(0);
});

test("Mac login startup is opt-in and can be turned off again", async ({ page }, info) => {
	await prepareMacPermissions(page);
	await page.goto("/me/general");
	const login = page.getByRole("switch", { name: "登录时启动" });
	const background = page.getByRole("switch", { name: /允许后台运行/ });
	await expect(login).not.toBeChecked();
	await expect(background).toBeChecked();
	await background.scrollIntoViewIfNeeded();
	await page.screenshot({ path: info.outputPath("mac-permissions-general.png") });
	await login.click();
	await expect(login).toBeChecked();
	await login.click();
	await expect(login).not.toBeChecked();
	await background.click();
	await expect(background).not.toBeChecked();
});
