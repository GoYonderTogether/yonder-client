// @vitest-environment jsdom
import { waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { beginTrayConnectorWork, isTrayPanel, observeTrayActivity, type TraySnapshot } from "./tray-bridge.ts";

const native = vi.hoisted(() => ({ invoke: vi.fn(), window: { label: "main" } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({ getCurrentWebviewWindow: () => native.window }));
vi.mock("./platform.ts", () => ({ isDesktopShell: () => true }));

test("a URL query cannot turn the main webview into the tray panel", () => {
	history.replaceState(null, "", "/?tray-panel=1");
	expect(isTrayPanel()).toBe(false);
	native.window.label = "tray-panel";
	expect(isTrayPanel()).toBe(true);
	history.replaceState(null, "", "/");
	expect(isTrayPanel()).toBe(false);
	native.window.label = "main";
});

test("publish combines concurrent local work and clears only resolved commands", async () => {
	native.invoke.mockReset();
	native.invoke.mockResolvedValue(null);
	const local = { botId: "bot", botName: "Bot", conversationId: "chat", conversationTitle: "Chat", activity: "Read" };
	const read = beginTrayConnectorWork(local);
	const edit = beginTrayConnectorWork({ ...local, activity: "Edit" });
	const other = beginTrayConnectorWork(null);
	read.update("Report");
	await waitFor(() =>
		expect(native.invoke).toHaveBeenLastCalledWith("tray_publish_activity", {
			activity: {
				groups: [
					{ botId: "bot", botName: "Bot", entries: [{ id: "chat", conversationTitle: "Chat", activity: "Report" }] },
				],
				unattributed: true,
			},
		}),
	);
	read.finish();
	await waitFor(() =>
		expect(native.invoke).toHaveBeenLastCalledWith("tray_publish_activity", {
			activity: {
				groups: [
					{ botId: "bot", botName: "Bot", entries: [{ id: "chat", conversationTitle: "Chat", activity: "Edit" }] },
				],
				unattributed: true,
			},
		}),
	);
	edit.finish();
	await waitFor(() =>
		expect(native.invoke).toHaveBeenLastCalledWith("tray_publish_activity", {
			activity: { groups: [], unattributed: true },
		}),
	);
	other.finish();
	await waitFor(() =>
		expect(native.invoke).toHaveBeenLastCalledWith("tray_publish_activity", {
			activity: { groups: [], unattributed: false },
		}),
	);
});

test("tray activity uses a guarded snapshot and drops out-of-order or disposed refreshes", async () => {
	native.invoke.mockReset();
	const reads: ((value: TraySnapshot | null) => void)[] = [];
	native.invoke.mockImplementation(() => new Promise((resolve) => reads.push(resolve)));
	const seen = vi.fn();
	const unavailable = vi.fn();
	const stop = await observeTrayActivity(seen, unavailable);
	expect(native.invoke).toHaveBeenCalledWith("tray_get_activity");
	window.dispatchEvent(new Event("yonder-tray-activity"));
	reads[1]?.({ groups: [], unattributed: true });
	reads[0]?.(null);
	await waitFor(() => expect(seen.mock.calls).toEqual([[{ groups: [], unattributed: true }]]));
	window.dispatchEvent(new Event("yonder-tray-activity"));
	stop();
	reads[2]?.(null);
	await Promise.resolve();
	expect(seen).toHaveBeenCalledOnce();
	expect(unavailable).not.toHaveBeenCalled();
});
