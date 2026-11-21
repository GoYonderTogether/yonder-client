import { expect, test } from "@playwright/test";
import { isolateChat } from "./chat-fixture.ts";

test("Mac first login and device management use the appropriate permission actions", async ({ page }, info) => {
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
		let accessibility = "off";
		let microphone = "default";
		let notification = "denied";
		let login = "enabled";
		let closeBehavior = "tray";
		const settingsOpened: unknown[] = [];
		Object.assign(window, {
			settingsOpened,
			revokeAccessibility() {
				accessibility = "off";
				window.dispatchEvent(new Event("focus"));
			},
			__TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
			__TAURI_INTERNALS__: {
				metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
				transformCallback: () => 1,
				unregisterCallback() {},
				invoke: async (command: string, args: Record<string, unknown>) => {
					switch (command) {
						case "plugin:keyring|get_password":
							return "isolated-mac-permissions";
						case "plugin:yonder-mac-permissions|permission_status":
							return { accessibility, microphone };
						case "plugin:yonder-mac-permissions|open_settings":
							settingsOpened.push(args.permission);
							break;
						case "plugin:yonder-mac-permissions|request_accessibility":
							accessibility = "granted";
							break;
						case "plugin:yonder-mac-permissions|request_microphone":
							microphone = "granted";
							break;
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

	await page.goto("/me/devices");
	const intro = page.getByRole("main", { name: "", exact: true });
	await expect(intro.getByRole("heading", { name: "设置这台电脑" })).toBeFocused();
	await expect(intro.getByRole("button")).toHaveCount(3);
	await expect(intro.getByText("允许 Bot 在本机查找和阅读文件")).toBeVisible();
	await expect(intro.getByText(/麦克风|通知/)).toHaveCount(0);
	await expect(page.getByRole("button", { name: "管理权限" })).toHaveCount(0);
	await page.screenshot({ path: info.outputPath("mac-permissions-onboarding.png") });
	await intro.getByRole("button", { name: "打开系统设置" }).click();
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { settingsOpened: unknown[] }).settingsOpened))
		.toEqual(["fullDisk"]);
	await intro.getByRole("button", { name: "开启辅助功能" }).click();
	await expect(intro.getByText("系统权限已开启")).toBeVisible();
	await intro.getByRole("button", { name: "继续使用 Yonder" }).click();
	await expect(intro.getByRole("heading", { name: "设置这台电脑" })).toHaveCount(0);

	const manage = page.getByRole("button", { name: "管理权限" });
	await expect(manage).toHaveCount(1);
	await manage.click();
	const modal = page.getByRole("dialog", { name: "管理权限" });
	await expect(modal.getByText("在系统设置中查看")).toBeVisible();
	await expect(modal.getByText("系统权限已开启")).toHaveCount(1);
	await expect(modal.getByRole("button", { name: "允许麦克风" })).toBeVisible();
	await expect(modal.getByText("未允许")).toBeVisible();
	await page.screenshot({ path: info.outputPath("mac-permissions-dialog.png") });
	await page.evaluate(() => (window as unknown as { revokeAccessibility: () => void }).revokeAccessibility());
	await expect(modal.getByText("未开启")).toBeVisible();
	await modal.getByRole("button", { name: "允许麦克风" }).click();
	await expect(modal.getByText("系统权限已开启")).toHaveCount(1);
	await modal.getByRole("button", { name: "关闭" }).click();
	await expect(modal).toHaveCount(0);
	await page.reload();
	await expect(manage).toBeVisible();
	await expect(intro.getByRole("heading", { name: "设置这台电脑" })).toHaveCount(0);

	await page.goto("/me/general");
	const login = page.getByRole("switch", { name: "登录时启动" });
	const background = page.getByRole("switch", { name: /允许后台运行/ });
	await expect(login).toBeChecked();
	await expect(background).toBeChecked();
	await background.scrollIntoViewIfNeeded();
	await page.screenshot({ path: info.outputPath("mac-permissions-general.png") });
	await login.click();
	await expect(login).not.toBeChecked();
	await background.click();
	await expect(background).not.toBeChecked();
});
