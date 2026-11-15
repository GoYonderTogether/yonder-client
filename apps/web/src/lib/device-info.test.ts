// @vitest-environment jsdom
import { createMemoryStorage } from "@yonder/ui-data";
import { afterEach, expect, test, vi } from "vitest";
import { deviceInfo } from "./device-info.ts";

afterEach(() => {
	vi.unstubAllGlobals();
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
