import { expect, test, vi } from "vitest";
import { updateDriver } from "./drivers.ts";

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
	Channel: class {
		constructor(public onmessage: (value: unknown) => void) {}
	},
}));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

test("Android uses the installed versionCode and passes the verified manifest to its native downloader", async () => {
	const { invoke } = await import("@tauri-apps/api/core");
	const release = {
		version: "0.3.26111502",
		versionCode: 26111502,
		url: "https://dl.zethai.cn/android/yonder.apk",
		sha256: "a".repeat(64),
		minSupportedVersion: "0.3.26111401",
	};
	vi.mocked(invoke).mockImplementation(async (command) => {
		if (command === "plugin:android-update|versionCode") return { versionCode: 26111501 } as never;
		if (command === "plugin:android-update|latest") return release as never;
		return undefined as never;
	});
	const candidate = await updateDriver("android").check();
	expect(candidate).toMatchObject({ version: release.version, required: true });
	await candidate?.download(() => {});
	expect(invoke).toHaveBeenCalledWith(
		"plugin:android-update|download",
		expect.objectContaining({ url: release.url, sha256: release.sha256 }),
	);
	vi.mocked(invoke).mockImplementation(async (command) =>
		command === "plugin:android-update|versionCode" ? ({ versionCode: 26111502 } as never) : (release as never),
	);
	expect(await updateDriver("android").check()).toBeNull();
	expect(invoke).not.toHaveBeenCalledWith("plugin:android-update|install", expect.anything());
	await candidate?.install?.();
	expect(invoke).toHaveBeenCalledWith("plugin:android-update|install", { sha256: release.sha256 });
});

test("desktop uses Tauri download then user-initiated install and relaunch", async () => {
	const { check } = await import("@tauri-apps/plugin-updater");
	const { relaunch } = await import("@tauri-apps/plugin-process");
	const update = {
		version: "0.3.12",
		download: vi.fn(async () => {}),
		install: vi.fn(async () => {}),
		close: vi.fn(async () => {}),
	};
	vi.mocked(check).mockResolvedValue(update as never);
	const candidate = await updateDriver("desktop").check();
	await candidate?.download(() => {});
	expect(update.install).not.toHaveBeenCalled();
	await candidate?.install?.();
	expect(update.install).toHaveBeenCalledOnce();
	expect(relaunch).toHaveBeenCalledOnce();
});

test("Android rechecks the candidate channel before handing off a staged beta installer", async () => {
	const { invoke } = await import("@tauri-apps/api/core");
	vi.mocked(invoke).mockClear();
	vi.mocked(invoke).mockImplementation(async (command) =>
		command === "plugin:android-update|versionCode" ? ({ versionCode: 26111501 } as never) : (undefined as never),
	);
	const manifest = {
		version: "0.3.26111502",
		versionCode: 26111502,
		url: "https://dl.zethai.cn/android/yonder-0.3.26111502.apk",
		sha256: "b".repeat(64),
	};
	const offer = { id: "beta", channel: "beta", platform: "android", version: manifest.version, manifest } as const;
	const read = vi.fn().mockResolvedValueOnce(offer).mockResolvedValueOnce(null);
	const candidate = await updateDriver("android", read).check();
	expect(candidate).toBeTruthy();
	await candidate?.download(() => {});
	expect(invoke).not.toHaveBeenCalledWith("plugin:android-update|latest");
	await expect(candidate?.install?.()).rejects.toThrow("Update is no longer available");
	expect(invoke).not.toHaveBeenCalledWith("plugin:android-update|install", expect.anything());
});
