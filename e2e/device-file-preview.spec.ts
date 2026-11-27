import { createHash } from "node:crypto";
import { devices, expect, test } from "@playwright/test";
import type { ConnectorInstance } from "@yonder/protocol";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

const device: ConnectorInstance = {
	id: "con_file_preview",
	connectorId: "local-files",
	scope: "device",
	capabilities: { fileTools: false },
	revision: 1,
	deviceId: "device_mac",
	deviceName: "工作 Mac",
	name: "文件",
	status: "online",
	currentDevice: false,
	createdAt: "2026-11-20T01:00:00Z",
};
const plainPath = "~/Documents/项目资料/发布安排.md";
const folderPath = "~/Documents/项目资料";
const markdownLink = `[项目资料目录](yonder-file:${device.id}/${encodeURIComponent(folderPath)})`;
const oldBody = "# 发布安排\n\n先确认交付范围，再整理手机端回归的截图。";
const newBody = "# 发布安排\n\n已确认交付范围，开始跑手机端回归。";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const evidence = process.env.YONDER_E2E_EVIDENCE_DIR ?? "test-results/evidence/device-file-preview";

const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
for (const layout of ["desktop", "phone"]) {
	test.describe(layout, () => {
		test.use({ ...(layout === "phone" ? phone : { viewport: { width: 1440, height: 850 } }), reducedMotion: "reduce" });
		test("opens source-aware files and directories, verifies versions and clears revoked copies", async ({ page }) => {
			const fixture = await isolateChat(page, {
				items: [message("device-file-01", `这里是口播稿：'\\${plainPath}'。\n\n${markdownLink}`)],
			});
			let content = oldBody;
			let status: "online" | "offline" | "revoked" = "online";
			let holdUpdate: Promise<void> | undefined;
			const requests: { path: string; knownSha256?: string }[] = [];
			await page.route("**/v1/connectors", (route) =>
				route.fulfill({ json: { items: status === "revoked" ? [] : [{ ...device, status }] } }),
			);
			await page.route(`**/v1/connectors/${device.id}/file-preview`, async (route) => {
				const request = route.request().postDataJSON() as (typeof requests)[number];
				requests.push(request);
				if (status === "offline")
					return route.fulfill({
						status: 503,
						json: { error: { code: "upstream_unavailable", details: { reason: "device_unavailable" } } },
					});
				if (status === "revoked") return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
				if (request.path === folderPath)
					return route.fulfill({
						json: { kind: "directory", entries: [{ name: "发布安排.md", type: "file" }], truncated: false },
					});
				expect(request.path).toBe(plainPath);
				await holdUpdate;
				const sha256 = hash(content);
				if (request.knownSha256 === sha256) return route.fulfill({ json: { kind: "unchanged", sha256 } });
				return route.fulfill({
					body: content,
					headers: {
						"content-type": "text/markdown",
						"x-yonder-file-sha256": sha256,
						"content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent("发布安排.md")}`,
					},
				});
			});
			await page.goto("/messages/main");
			await expect.poll(fixture.connected).toBeTruthy();
			await page.getByRole("button", { name: /发布安排\.md.*工作 Mac/ }).click();
			const reader = page.locator("[data-device-file-reader]:visible");
			await expect(reader.getByText("先确认交付范围，再整理手机端回归的截图。")).toBeVisible();
			await expect(reader.getByText("工作 Mac", { exact: true })).toBeVisible();
			if (layout === "phone") {
				await expect
					.poll(async () => {
						const box = await reader.boundingBox();
						return box !== null && Math.abs(box.x) < 1 && Math.abs(box.width - phone.viewport.width) < 1;
					})
					.toBe(true);
			}
			await page.screenshot({
				path: `${evidence}/live-device-file-${layout}.png`,
				animations: "disabled",
				scale: "css",
			});
			content = newBody;
			const update = Promise.withResolvers<void>();
			holdUpdate = update.promise;
			fixture.updateConnectors();
			try {
				await expect(reader.getByRole("status", { name: "正在检查文件更新" })).toBeVisible();
				await expect(reader.getByText("先确认交付范围，再整理手机端回归的截图。")).toBeVisible();
				await page.screenshot({
					path: `${evidence}/live-device-file-refreshing-${layout}.png`,
					animations: "disabled",
					scale: "css",
				});
			} finally {
				update.resolve();
				holdUpdate = undefined;
			}
			await expect(reader.getByText("已确认交付范围，开始跑手机端回归。")).toBeVisible();
			expect(requests.some((request) => request.knownSha256 === hash(oldBody))).toBe(true);
			status = "offline";
			fixture.updateConnectors();
			await expect(reader.getByText("源设备离线 · 上次读取的版本")).toBeVisible();
			await expect(reader.getByText("已确认交付范围，开始跑手机端回归。")).toBeVisible();
			await page.screenshot({
				path: `${evidence}/live-device-file-offline-${layout}.png`,
				animations: "disabled",
				scale: "css",
			});
			status = "online";
			fixture.updateConnectors();
			await expect(reader.getByText("源设备离线 · 上次读取的版本")).toHaveCount(0);
			if (layout === "phone") await page.getByRole("button", { name: "返回", exact: true }).click();
			await page.getByRole("button", { name: /项目资料目录.*工作 Mac/ }).click();
			await expect(reader.getByRole("button", { name: "发布安排.md", exact: true })).toBeVisible();
			await page.screenshot({
				path: `${evidence}/live-device-directory-${layout}.png`,
				animations: "disabled",
				scale: "css",
			});
			await reader.getByRole("button", { name: "发布安排.md", exact: true }).click();
			await expect(reader.getByText("已确认交付范围，开始跑手机端回归。")).toBeVisible();
			if (layout === "desktop") await expect(page.getByRole("tab", { name: /发布安排\.md.*工作 Mac/ })).toHaveCount(1);
			status = "revoked";
			fixture.updateConnectors();
			await expect(reader.getByText("文件不存在或已无法访问")).toBeVisible();
			await expect(reader.getByText("已确认交付范围，开始跑手机端回归。")).toHaveCount(0);
			await expect
				.poll(() =>
					page.evaluate(async () => {
						const db = await new Promise<IDBDatabase>((resolve, reject) => {
							const open = indexedDB.open("yonder-chat", 1);
							open.onsuccess = () => resolve(open.result);
							open.onerror = () => reject(open.error);
						});
						return new Promise<number>((resolve, reject) => {
							const keys = db.transaction("records").objectStore("records").getAllKeys();
							keys.onsuccess = () => {
								db.close();
								resolve(keys.result.filter((key) => String(key).startsWith("device-file:")).length);
							};
							keys.onerror = () => reject(keys.error);
						});
					}),
				)
				.toBe(0);
		});
	});
}

test("an unbound path requires a source choice when multiple devices can read it", async ({ page }) => {
	await isolateChat(page, {
		items: [message("device-file-01", `'${plainPath}'\n\n[网站 \`${plainPath}\`](https://example.test)`)],
	});
	const other = { ...device, id: "con_other", deviceId: "device_other", deviceName: "家里的 Mac", currentDevice: true };
	await page.route("**/v1/connectors", (route) => route.fulfill({ json: { items: [device, other] } }));
	const requests: string[] = [];
	await page.route("**/v1/connectors/*/file-preview", (route) => {
		requests.push(route.request().url());
		return route.fulfill({ json: { kind: "directory", entries: [], truncated: false } });
	});
	await page.goto("/messages/main");
	const webLink = page.getByRole("link", { name: /网站.*发布安排/u });
	await expect(webLink).toHaveAttribute("href", "https://example.test");
	await expect(webLink.getByRole("button")).toHaveCount(0);
	await page.getByRole("button", { name: "发布安排.md", exact: true }).click();
	const choices = page.getByRole("dialog", { name: "选择文件所在设备" });
	await expect(choices.getByRole("button", { name: "家里的 Mac", exact: true })).toBeVisible();
	await expect(choices.getByRole("button", { name: "工作 Mac", exact: true })).toBeVisible();
	expect(requests).toEqual([]);
	await page.screenshot({ path: `${evidence}/live-device-source-picker-desktop.png`, animations: "disabled" });
	await choices.getByRole("button", { name: "工作 Mac", exact: true }).click();
	await expect(page.getByText("此目录为空")).toBeVisible();
	expect(requests).toHaveLength(1);
	expect(requests[0]).toMatch(/\/v1\/connectors\/con_file_preview\/file-preview$/u);
});

test("a different participant’s path stays plain text", async ({ page }) => {
	await isolateChat(page, {
		group: true,
		members: [
			...conversation.members,
			{ memberId: "guest", kind: "person", handle: "guest", displayName: "另一位成员", avatarUrl: null },
		],
		items: [message("device-file-01", `'${plainPath}'\n\n${markdownLink}`)],
	});
	await page.goto(`/messages/${conversation.id}`);
	await expect(page.getByText("项目资料目录", { exact: true })).toBeVisible();
	await expect(page.locator("[data-device-file-link], a[href^='yonder-file:']")).toHaveCount(0);
});
