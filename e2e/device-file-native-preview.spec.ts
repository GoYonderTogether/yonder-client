import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { ConnectorFileTextPage, ConnectorInstance } from "@yonder/protocol";
import { isolateChat, message } from "./chat-fixture.ts";

test("desktop waits for its verified device identity and previews same-machine text without the gateway", async ({
	page,
}) => {
	const name = "本机记录.txt";
	const path = `~/Documents/${name}`;
	const local: ConnectorInstance = {
		id: "con_native_file_preview",
		connectorId: "local-files",
		scope: "device",
		capabilities: { fileTools: false, terminal: false, browser: false },
		revision: 1,
		deviceId: "device_native",
		deviceName: "本机 Mac",
		name: "文件",
		status: "online",
		// This connection was selected before the native window's session was loaded.
		currentDevice: false,
		createdAt: "2026-11-20T01:00:00Z",
	};
	const content = "由本机读取，保留原有字节。\r\n";
	const sha256 = createHash("sha256").update(content).digest("hex");
	const text: ConnectorFileTextPage = {
		kind: "text_page",
		name,
		mimeType: "text/plain",
		sha256,
		offset: 0,
		nextOffset: null,
		content,
		pageSha256: sha256,
	};
	await isolateChat(page, { items: [message("device-file-05", `'${path}'`)] });
	await page.route("**/v1/connectors", (route) => route.fulfill({ json: { items: [local] } }));
	const session = Promise.withResolvers<void>();
	await page.route("**/v1/me/sessions", async (route) => {
		await session.promise;
		return route.fulfill({ json: { items: [{ id: "ses_local", deviceId: local.deviceId, current: true }] } });
	});
	let remote = 0;
	await page.route("**/v1/connectors/*/file-preview", (route) => {
		remote += 1;
		return route.fulfill({ status: 500, json: { error: { code: "internal" } } });
	});
	await page.addInitScript(
		({ text }) => {
			Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)" });
			const fileCalls: unknown[] = [];
			Object.assign(window, {
				fileCalls,
				__TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
				__TAURI_INTERNALS__: {
					metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
					transformCallback: () => 1,
					unregisterCallback() {},
					async invoke(command: string, args: Record<string, unknown>) {
						if (command === "get_desktop_refresh_token") return "native-file-preview-fixture";
						if (command === "local_files_ready") return args.connections;
						if (command === "local_files_execute") {
							fileCalls.push(args.command);
							const meta = new TextEncoder().encode(JSON.stringify(text));
							const packet = new Uint8Array(meta.length + 4);
							new DataView(packet.buffer).setUint32(0, meta.length);
							packet.set(meta, 4);
							return [...packet];
						}
						return null;
					},
				},
			});
		},
		{ text },
	);
	await page.goto("/messages/main");
	await page.getByRole("button", { name, exact: true }).click();
	const reader = page.locator("[data-device-file-reader]:visible");
	try {
		await expect(page.getByRole("tabpanel").getByRole("status", { name: "正在检查文件更新" })).toBeVisible();
		expect(remote).toBe(0);
	} finally {
		session.resolve();
	}
	await expect(reader.locator("pre")).toHaveText(content.trim());
	const calls = await page.evaluate(() => Reflect.get(window, "fileCalls") as unknown[]);
	expect(calls).toEqual([
		expect.objectContaining({
			connectionId: local.id,
			deviceId: local.deviceId,
			operation: "file_preview",
			path,
			args: { textPage: { offset: 0 } },
		}),
	]);
	expect(remote).toBe(0);
});
