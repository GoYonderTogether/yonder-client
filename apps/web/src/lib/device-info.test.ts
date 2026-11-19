// @vitest-environment jsdom
import { createMemoryStorage } from "@yonder/ui-data";
import { afterEach, expect, test, vi } from "vitest";
import { deviceInfo, loadSystemDeviceName } from "./device-info.ts";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

afterEach(() => {
	vi.unstubAllGlobals();
	invoke.mockReset();
});

test("each installation keeps its identity across sign-ins, while two Windows clients stay separate", () => {
	vi.stubGlobal("navigator", { userAgent: "Windows NT 10.0", maxTouchPoints: 0 });
	vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
	const first = createMemoryStorage();
	const second = createMemoryStorage();
	const a = deviceInfo(first, "1");
	const b = deviceInfo(second, "1");
	expect(a.platform).toBe("windows");
	expect(a.installationId).not.toBe(b.installationId);
	expect(deviceInfo(first, "2").installationId).toBe(a.installationId);
});

test.each([
	["Macintosh", 0, "macos"],
	["Macintosh", 5, "ios"],
	["iPhone", 1, "ios"],
	["Android", 1, "android"],
	["Linux", 0, "linux"],
])("only native shells report their actual OS: %s", (userAgent, maxTouchPoints, platform) => {
	vi.stubGlobal("navigator", { userAgent, maxTouchPoints });
	vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
	expect(deviceInfo(createMemoryStorage(), "1").platform).toBe(platform);
	vi.stubGlobal("window", {});
	expect(deviceInfo(createMemoryStorage(), "1").platform).toBe("web");
});

test("the system name updates display metadata without changing the installation or its platform", async () => {
	vi.stubGlobal("navigator", { userAgent: "Macintosh", maxTouchPoints: 0 });
	vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
	const storage = createMemoryStorage();
	const original = deviceInfo(storage, "1");
	invoke.mockResolvedValueOnce("  工作室的 Mac 🖥️  ");
	expect(deviceInfo(storage, "2", await loadSystemDeviceName())).toEqual({
		...original,
		name: "工作室的 Mac 🖥️",
		appVersion: "2",
	});
	expect(invoke).toHaveBeenCalledWith("plugin:yonder-device-info|system_name");
	expect(deviceInfo(storage, "1", "🚀".repeat(65))).toEqual(original);
	invoke.mockRejectedValueOnce(new Error("unavailable in older shells"));
	expect(deviceInfo(storage, "1", await loadSystemDeviceName())).toEqual(original);
});

test("the browser keeps its fallback and does not query the native bridge", async () => {
	vi.stubGlobal("navigator", { userAgent: "Macintosh", maxTouchPoints: 0 });
	vi.stubGlobal("window", {});
	expect(await loadSystemDeviceName()).toBeNull();
	expect(invoke).not.toHaveBeenCalled();
	expect(deviceInfo(createMemoryStorage(), "1", "Should not be used")).toMatchObject({ name: "Mac", platform: "web" });
});
