import { expect, test } from "@playwright/test";
import type { DeviceSummary, UpdateDeviceRemarkRequest } from "@yonder/protocol";
import { isolateChat } from "./chat-fixture.ts";

const mac: DeviceSummary = {
	id: "dev_mac",
	name: "MacBook Pro",
	platform: "macos",
	current: true,
	status: "online",
	lastSeenAt: "2026-11-19T00:00:00Z",
	appVersion: "0.3.0",
};
const iphone: DeviceSummary = {
	...mac,
	id: "dev_iphone",
	name: "iPhone 17",
	platform: "ios",
	current: false,
	status: "offline",
};

for (const width of [1280, 390]) {
	test(`device remarks can be saved, reloaded and cleared at ${width}px`, async ({ page }, info) => {
		await page.setViewportSize({ width, height: 844 });
		await page.emulateMedia({ reducedMotion: "reduce" });
		await isolateChat(page);
		let remark: string | null = null;
		const submitted: UpdateDeviceRemarkRequest[] = [];
		await page.route("**/v1/devices", (route) => route.fulfill({ json: { items: [mac, { ...iphone, remark }] } }));
		await page.route("**/v1/devices/dev_iphone", async (route) => {
			expect(route.request().method()).toBe("PATCH");
			const body: UpdateDeviceRemarkRequest = route.request().postDataJSON();
			submitted.push(body);
			if (submitted.length === 1) {
				await route.fulfill({ status: 503, json: { error: { code: "unavailable", message: "Unavailable" } } });
				return;
			}
			remark = body.remark;
			await route.fulfill({ json: { ok: true } });
		});

		await page.goto("/me/devices");
		const edit = (name: string) => page.getByRole("button", { name: `编辑 ${name} 的备注`, exact: true });
		const editor = page.getByRole("dialog", { name: "编辑备注", exact: true });
		const input = editor.getByRole("textbox", { name: "设备备注" });
		const save = editor.getByRole("button", { name: "保存", exact: true });
		await expect(page.getByText(mac.name, { exact: true })).toBeVisible();
		await edit(iphone.name).focus();
		await page.keyboard.press("Enter");
		await expect(input).toHaveValue("");
		await expect(input).toHaveAttribute("placeholder", iphone.name);
		await input.fill("🙂".repeat(81));
		await expect(save).toBeDisabled();
		await expect(editor.getByRole("alert")).toHaveText("备注最多 80 个字。");
		await input.fill("  随身手机  ");
		await input.press("Enter");
		await expect(editor.getByRole("alert")).toHaveText("备注保存失败，请重试。");
		await expect(input).toHaveValue("  随身手机  ");
		await save.click();
		await expect(editor).toHaveCount(0);
		const renamed = page.getByRole("listitem").filter({ has: edit("随身手机") });
		await expect(renamed.getByText("随身手机", { exact: true })).toBeVisible();
		await expect(renamed.getByText("iPhone 17 · iOS · 离线", { exact: true })).toBeVisible();
		await page.screenshot({ path: info.outputPath("device-remark-saved.png"), animations: "disabled" });

		await page.reload();
		await edit("随身手机").click();
		await expect(input).toHaveValue("随身手机");
		await expect(input).toBeInViewport();
		await page.screenshot({ path: info.outputPath("device-remark-editor.png"), animations: "disabled" });
		await input.fill(" ");
		await save.click();
		await expect(editor).toHaveCount(0);
		await expect(edit(iphone.name)).toBeVisible();
		expect(submitted).toEqual([{ remark: "随身手机" }, { remark: "随身手机" }, { remark: null }]);
	});
}
