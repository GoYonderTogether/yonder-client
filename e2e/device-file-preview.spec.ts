import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { devices, expect, test } from "@playwright/test";
import type { ConnectorFilePreviewRequest, ConnectorFileTextPage, ConnectorInstance } from "@yonder/protocol";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

const device: ConnectorInstance = {
	id: "con_file_preview",
	connectorId: "local-files",
	scope: "device",
	capabilities: { fileTools: false, terminal: false, browser: false },
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

function longSubtitles() {
	const size = 66_718;
	const cue = (number: number, text: string) => `${number}\r\n00:00:01,000 --> 00:00:03,000\r\n${text}\r\n\r\n`;
	const first = "首段字幕：项目开场。";
	const last = "末段字幕：验收完成。";
	let text = cue(1, first);
	let number = 2;
	const sample = "同步核对发布窗口，整理手机和桌面端的验收记录。";
	while (text.length + cue(number, sample).length + cue(number + 1, last).length + 90 <= size) {
		text += cue(number, sample);
		number += 1;
	}
	const remainder = size - text.length - cue(number, "").length - cue(number + 1, last).length;
	return (
		text + cue(number, sample.repeat(Math.ceil(remainder / sample.length)).slice(0, remainder)) + cue(number + 1, last)
	);
}

function textPages(name: string, content: string, maxBytes = 48_000): ConnectorFileTextPage[] {
	const sha256 = hash(content);
	const formatted: ConnectorFileTextPage[] = [];
	const bytes = Buffer.from(content);
	for (let offset = 0; offset < bytes.length; ) {
		const end = offset + maxBytes < bytes.length ? bytes.lastIndexOf(10, offset + maxBytes - 1) + 1 : bytes.length;
		if (end <= offset) throw new Error("fixture line exceeds the page size");
		const part = bytes.subarray(offset, end).toString("utf8");
		formatted.push({
			kind: "text_page",
			name,
			mimeType: name.endsWith(".md") ? "text/markdown" : "text/plain",
			sha256,
			offset,
			nextOffset: end === bytes.length ? null : end,
			content: part,
			pageSha256: hash(part),
		});
		offset = end;
	}
	return formatted;
}

const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
for (const layout of ["desktop", "phone"]) {
	test.describe(layout, () => {
		test.use({ ...(layout === "phone" ? phone : { viewport: { width: 1440, height: 850 } }), reducedMotion: "reduce" });
		test("scrolls a 66,718-character subtitle to its last cue without paging controls", async ({ page }) => {
			const name = "发布安排.srt";
			const path = `~/Documents/字幕/${name}`;
			await isolateChat(page, { items: [message("device-file-02", `字幕在 '${path}'。`)] });
			await page.route("**/v1/connectors", (route) => route.fulfill({ json: { items: [device] } }));
			const subtitles = longSubtitles();
			const sha256 = hash(subtitles);
			expect(subtitles).toHaveLength(66_718);
			const pages = textPages(name, subtitles);
			const requests: ConnectorFilePreviewRequest[] = [];
			await page.route(`**/v1/connectors/${device.id}/file-preview`, (route) => {
				const request = route.request().postDataJSON() as ConnectorFilePreviewRequest;
				requests.push(request);
				expect(request.path).toBe(path);
				expect(request.delivery).toBe("auto");
				if (request.knownSha256 === sha256) return route.fulfill({ json: { kind: "unchanged", sha256 } });
				if (request.offset !== undefined) expect(request.expectedSha256).toBe(sha256);
				const result = pages.find((part) => part.offset === (request.offset ?? 0));
				expect(result).toBeDefined();
				return route.fulfill({ json: result });
			});
			await page.goto("/messages/main");
			await page.getByRole("button", { name, exact: true }).click();
			const reader = page.locator("[data-attachment-pane-reader]:visible");
			const scroll = reader.locator(".attachment-document-scroll");
			const body = scroll.locator("pre");
			await expect(body).toContainText("首段字幕：项目开场。");
			await expect(body).not.toContainText("末段字幕：验收完成。");
			await expect(reader.locator(".attachment-reader-toolbar")).toHaveCount(0);
			expect(requests.map((request) => request.offset ?? 0)).toEqual([0]);
			await page.screenshot({ path: `${evidence}/subtitle-start-${layout}.png`, animations: "disabled", scale: "css" });
			for (const _part of pages.slice(1)) {
				const before = (await body.textContent())?.length ?? 0;
				await scroll.evaluate((element) => element.scrollTo(0, element.scrollHeight));
				await expect.poll(async () => (await body.textContent())?.length ?? 0).toBeGreaterThan(before);
			}
			await expect(body).toContainText("末段字幕：验收完成。");
			expect(await body.evaluate((element, text) => element.textContent === text, subtitles)).toBe(true);
			await scroll.evaluate((element) => element.scrollTo(0, element.scrollHeight));
			await expect
				.poll(() =>
					body.evaluate((element) => {
						const lastPage = element.lastChild;
						const scroll = element.parentElement;
						if (!lastPage?.textContent || !scroll) return false;
						const cue = lastPage.textContent.lastIndexOf("末段字幕：验收完成。");
						if (cue < 0) return false;
						const range = document.createRange();
						range.setStart(lastPage, cue);
						range.setEnd(lastPage, cue + "末段字幕：验收完成。".length);
						const line = range.getBoundingClientRect();
						const bounds = scroll.getBoundingClientRect();
						return line.top >= bounds.top && line.bottom <= bounds.bottom;
					}),
				)
				.toBe(true);
			await page.screenshot({ path: `${evidence}/subtitle-end-${layout}.png`, animations: "disabled", scale: "css" });
			expect(requests.map((request) => request.offset ?? 0)).toEqual(pages.map((part) => part.offset));
			const callsBeforeReload = requests.length;
			await page.reload();
			await page.getByRole("button", { name, exact: true }).click();
			await expect(body).toContainText("首段字幕：项目开场。");
			await expect.poll(() => requests.length).toBe(callsBeforeReload + 1);
			expect(requests.at(-1)?.knownSha256).toBe(sha256);
			for (const _part of pages.slice(1)) {
				const before = (await body.textContent())?.length ?? 0;
				await scroll.evaluate((element) => element.scrollTo(0, element.scrollHeight));
				await expect.poll(async () => (await body.textContent())?.length ?? 0).toBeGreaterThan(before);
			}
			expect((await body.textContent()) === subtitles).toBe(true);
			expect(requests).toHaveLength(callsBeforeReload + 1);
		});
		test("opens source-aware files and directories, verifies versions and clears revoked copies", async ({ page }) => {
			const fixture = await isolateChat(page, {
				items: [message("device-file-01", `这里是口播稿：'\\${plainPath}'。\n\n${markdownLink}`)],
			});
			let content = oldBody;
			let status: "online" | "not-ready" | "offline" | "revoked" = "online";
			let holdUpdate: Promise<void> | undefined;
			const requests: { path: string; knownSha256?: string }[] = [];
			await page.route("**/v1/connectors", (route) =>
				route.fulfill({
					json: {
						items: status === "revoked" ? [] : [{ ...device, status: status === "online" ? "online" : "offline" }],
					},
				}),
			);
			await page.route("**/v1/devices", (route) =>
				route.fulfill({
					json: {
						items: [
							{
								id: device.deviceId,
								name: device.deviceName,
								platform: "macos",
								appVersion: "0.3.26112713",
								status: status === "offline" ? "offline" : "online",
								lastSeenAt: device.createdAt,
								current: false,
							},
						],
					},
				}),
			);
			await page.route(`**/v1/connectors/${device.id}/file-preview`, async (route) => {
				const request = route.request().postDataJSON() as (typeof requests)[number];
				requests.push(request);
				if (status === "offline" || status === "not-ready")
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
			await page.getByRole("button", { name: "发布安排.md", exact: true }).click();
			const reader = page.locator("[data-device-file-reader]:visible");
			const detail = page.getByRole(layout === "phone" ? "dialog" : "tabpanel");
			await expect(reader.getByText("先确认交付范围，再整理手机端回归的截图。")).toBeVisible();
			await expect(detail).toHaveAccessibleName("发布安排.md · 工作 Mac");
			await expect(detail.getByText("工作 Mac", { exact: true })).toHaveCount(0);
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
				await expect(detail.getByRole("status", { name: "正在检查文件更新" })).toBeVisible();
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
			status = "not-ready";
			fixture.updateConnectors();
			await expect(detail.getByText("文件读取暂不可用 · 上次读取的版本")).toBeVisible();
			await expect(detail.getByText(/源设备离线/u)).toHaveCount(0);
			await expect(reader.getByText("已确认交付范围，开始跑手机端回归。")).toBeVisible();
			await page.screenshot({
				path: `${evidence}/live-device-file-not-ready-${layout}.png`,
				animations: "disabled",
				scale: "css",
			});
			status = "offline";
			fixture.updateConnectors();
			await expect(detail.getByText("源设备离线 · 上次读取的版本")).toBeVisible();
			await expect(reader.getByText("已确认交付范围，开始跑手机端回归。")).toBeVisible();
			await page.screenshot({
				path: `${evidence}/live-device-file-offline-${layout}.png`,
				animations: "disabled",
				scale: "css",
			});
			status = "online";
			fixture.updateConnectors();
			await expect(detail.getByText("源设备离线 · 上次读取的版本")).toHaveCount(0);
			if (layout === "phone") await page.getByRole("button", { name: "返回", exact: true }).click();
			await page.getByRole("button", { name: "项目资料目录", exact: true }).click();
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
			await expect(detail.getByText("文件不存在或已无法访问")).toBeVisible();
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

test("rejects a corrupt page, then restarts on the new source version without mixing text", async ({ page }) => {
	const name = "验收.md";
	const path = `~/Documents/${name}`;
	await isolateChat(page, { items: [message("device-file-03", `'${path}'`)] });
	await page.route("**/v1/connectors", (route) => route.fulfill({ json: { items: [device] } }));
	const oldPages = textPages(name, `# 旧版开头\n${"旧版过程\n".repeat(1050)}旧版结尾\n`, 9_000);
	const newPages = textPages(name, `# 新版开头\n${"新版过程\n".repeat(1050)}新版结尾\n`, 9_000);
	const requests: [number, string | undefined][] = [];
	let switched = false;
	await page.route(`**/v1/connectors/${device.id}/file-preview`, (route) => {
		const { delivery, offset = 0, expectedSha256 } = route.request().postDataJSON() as ConnectorFilePreviewRequest;
		expect(delivery).toBe("auto");
		requests.push([offset, expectedSha256]);
		const pages = switched ? newPages : oldPages;
		if (expectedSha256 && expectedSha256 !== pages[0]?.sha256)
			return route.fulfill({ status: 409, json: { error: { code: "conflict", details: { reason: "conflict" } } } });
		const current = pages.find((part) => part.offset === offset);
		return route.fulfill({
			json: !switched && offset > 0 ? { ...current, pageSha256: "0".repeat(64) } : current,
		});
	});
	await page.goto("/messages/main");
	await page.getByRole("button", { name, exact: true }).click();
	const reader = page.locator("[data-device-file-reader]:visible");
	const scroll = reader.locator(".attachment-document-scroll");
	const text = scroll.locator("pre");
	const scrollToEnd = () => scroll.evaluate((element) => element.scrollTo(0, element.scrollHeight));
	await expect(text).toContainText("旧版开头");
	await scrollToEnd();
	await expect(reader.getByText("文件校验失败")).toBeVisible();
	await expect(text).not.toContainText("旧版结尾");
	expect(requests).toEqual([
		[0, undefined],
		[oldPages[1]?.offset, oldPages[0]?.sha256],
	]);
	switched = true;
	await reader.getByRole("button", { name: "重试", exact: true }).click();
	await expect(text).toContainText("新版开头");
	await expect(text).not.toContainText("旧版开头");
	await scrollToEnd();
	await expect(text).toContainText("新版结尾");
	expect(requests).toEqual([
		[0, undefined],
		[oldPages[1]?.offset, oldPages[0]?.sha256],
		[oldPages[1]?.offset, oldPages[0]?.sha256],
		[0, undefined],
		[newPages[1]?.offset, newPages[0]?.sha256],
	]);
});

test("signed download acknowledges only the exact locally saved original", async ({ page }) => {
	const name = "发布安排.txt";
	const path = `~/Documents/${name}`;
	const content = "发布安排\r\n\r\n先校验内容，再存储和确认临时原件。\r\n";
	const sha256 = hash(content);
	const receipt = "preview-receipt";
	const mimeType = "text/plain";
	const transfer = `/files/${receipt}`;
	let corrupt = true;
	let originalRequests = 0;
	let downloads = 0;
	let acknowledgements = 0;
	await isolateChat(page, { items: [message("device-file-04", `'${path}'`)] });
	await page.route("**/v1/connectors", (route) => route.fulfill({ json: { items: [device] } }));
	await page.route(`**/v1/connectors/${device.id}/file-preview`, (route) => {
		const request = route.request().postDataJSON() as ConnectorFilePreviewRequest;
		if (request.delivery === "auto") return route.fulfill({ json: textPages(name, content)[0] });
		expect(request).toEqual({ path, delivery: "original", expectedSha256: sha256 });
		originalRequests += 1;
		return route.fulfill({
			json: { kind: "download", name, mimeType, sha256, size: Buffer.byteLength(content), url: transfer, receipt },
		});
	});
	await page.route(`**${transfer}`, (route) => {
		downloads += 1;
		expect(route.request().headers().authorization).toBeUndefined();
		return route.fulfill({ body: corrupt ? content.replace("校验", "篡改") : content, contentType: mimeType });
	});
	await page.route(`**/v1/connectors/${device.id}/file-preview/${receipt}/ack`, async (route) => {
		expect(route.request().postDataJSON()).toEqual({ sha256 });
		const persisted = await page.evaluate(async (digest) => {
			const db = await new Promise<IDBDatabase>((resolve) => {
				const open = indexedDB.open("yonder-chat", 1);
				open.onsuccess = () => resolve(open.result);
			});
			const found = await new Promise<boolean>((resolve) => {
				const keys = db.transaction("records").objectStore("records").getAllKeys();
				keys.onsuccess = () => resolve(keys.result.some((key) => String(key).endsWith(`:version:${digest}:original`)));
			});
			db.close();
			return found;
		}, sha256);
		expect(persisted).toBe(true);
		acknowledgements += 1;
		return route.fulfill({ json: { ok: true } });
	});
	await page.goto("/messages/main");
	await page.getByRole("button", { name, exact: true }).click();
	await expect(page.locator("[data-device-file-reader] pre")).toHaveText(content.trim());
	await page.screenshot({
		path: `${evidence}/verified-original-download-desktop.png`,
		animations: "disabled",
		scale: "css",
	});
	const button = page.getByRole("button", { name: "下载原文件", exact: true });
	expect(originalRequests).toBe(0);
	await button.click();
	await expect(page.getByText("文件校验失败")).toBeVisible();
	expect(downloads).toBe(1);
	expect(acknowledgements).toBe(0);
	corrupt = false;
	for (let count = 0; count < 2; count += 1) {
		const [file] = await Promise.all([page.waitForEvent("download"), button.click()]);
		expect(file.suggestedFilename()).toBe(name);
		expect(await readFile(await file.path(), "utf8")).toBe(content);
	}
	await expect.poll(() => acknowledgements).toBe(1);
	await expect(page.getByText("文件校验失败")).toHaveCount(0);
	expect(originalRequests).toBe(2);
	expect(downloads).toBe(2);
});

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
