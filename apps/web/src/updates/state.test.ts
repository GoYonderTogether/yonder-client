import { expect, test, vi } from "vitest";
import { createUpdater, type UpdateCandidate } from "./state.ts";

function pending() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("desktop downloads in the background and only installs after a click", async () => {
	const download = pending();
	const install = vi.fn(async () => {});
	const candidate: UpdateCandidate = {
		version: "0.3.12",
		required: false,
		download: vi.fn(async (progress) => {
			progress(20, 100);
			await download.promise;
		}),
		install,
	};
	const driver = { platform: "desktop" as const, check: vi.fn(async () => candidate) };
	const updater = createUpdater(driver);
	const checking = updater.check();
	await vi.waitFor(() => expect(updater.getSnapshot()).toMatchObject({ status: "downloading", progress: 20 }));
	await updater.check();
	expect(driver.check).toHaveBeenCalledTimes(1);
	expect(install).not.toHaveBeenCalled();
	download.resolve();
	await checking;
	expect(updater.getSnapshot()).toMatchObject({ status: "ready", version: "0.3.12" });
	await updater.install();
	expect(install).toHaveBeenCalledOnce();
});

test("Android waits for a click, reports download progress and does not claim installation", async () => {
	const download = pending();
	const candidate: UpdateCandidate = {
		version: "0.3.12",
		required: true,
		download: vi.fn(async (progress) => {
			progress(3, 4);
			await download.promise;
		}),
		install: vi.fn(async () => {}),
	};
	const updater = createUpdater({ platform: "android", check: async () => candidate });
	await updater.check();
	expect(updater.getSnapshot()).toMatchObject({ status: "available", required: true });
	expect(candidate.download).not.toHaveBeenCalled();
	const installing = updater.install();
	expect(updater.getSnapshot()).toMatchObject({ status: "downloading", progress: 75 });
	download.resolve();
	await installing;
	expect(updater.getSnapshot().status).toBe("installerOpened");
});

test("check and download failures can be retried without raw errors", async () => {
	let attempts = 0;
	const candidate: UpdateCandidate = {
		version: "1.0.1",
		required: false,
		download: async () => {
			if (++attempts === 1) throw new Error("private exception");
		},
		install: vi.fn(async () => {}),
	};
	const check = vi.fn().mockRejectedValueOnce(new Error("private exception")).mockResolvedValue(candidate);
	const updater = createUpdater({ platform: "android", check });
	await updater.check();
	expect(updater.getSnapshot()).toEqual({ status: "error", error: "check" });
	await updater.check();
	await updater.install();
	expect(updater.getSnapshot()).toMatchObject({ status: "error", error: "download" });
	await updater.install();
	expect(updater.getSnapshot().status).toBe("installerOpened");
});

test("a later desktop check keeps the already downloaded update without downloading it again", async () => {
	const install = vi.fn(async () => {});
	const original: UpdateCandidate = { version: "1.0.1", required: false, download: vi.fn(async () => {}), install };
	const duplicate: UpdateCandidate = { ...original, close: vi.fn(async () => {}) };
	const check = vi
		.fn()
		.mockResolvedValueOnce(original)
		.mockResolvedValueOnce(duplicate)
		.mockRejectedValueOnce(new Error("offline"));
	const updater = createUpdater({ platform: "desktop", check });
	await updater.check();
	await updater.check();
	await updater.check();
	expect(original.download).toHaveBeenCalledOnce();
	expect(duplicate.close).toHaveBeenCalledOnce();
	expect(updater.getSnapshot().status).toBe("ready");
	await updater.install();
	expect(install).toHaveBeenCalledOnce();
});

test("an offered version must match local verification; Android stages before an explicit install", async () => {
	const download = vi.fn(async () => {});
	const install = vi.fn(async () => {});
	const close = vi.fn(async () => {});
	const updater = createUpdater({
		platform: "android",
		check: async () => ({ version: "0.3.99", required: false, download, install, close }),
	});
	await updater.check("0.3.98");
	expect(updater.getSnapshot().status).toBe("idle");
	expect(close).toHaveBeenCalledOnce();
	expect(download).not.toHaveBeenCalled();
	await updater.check("0.3.99");
	expect(updater.getSnapshot()).toMatchObject({ version: "0.3.99", status: "ready", notice: true });
	expect(download).toHaveBeenCalledOnce();
	expect(install).not.toHaveBeenCalled();
	expect(await updater.install("0.3.98")).toBe(false);
	expect(install).not.toHaveBeenCalled();
	expect(await updater.install("0.3.99")).toBe(true);
	expect(install).toHaveBeenCalledOnce();
	expect(updater.getSnapshot().status).toBe("installerOpened");
});

test("an explicit request joins the existing download and never installs on its own", async () => {
	const staging = pending();
	const download = vi.fn(() => staging.promise);
	const install = vi.fn(async () => {});
	const check = vi.fn(async () => ({ version: "0.3.99", required: false, download, install }));
	const updater = createUpdater({ platform: "android", check });
	const background = updater.check("0.3.99");
	await vi.waitFor(() => expect(download).toHaveBeenCalledOnce());
	const explicit = updater.prepare("0.3.99");
	const mismatched = updater.prepare("0.3.98");
	staging.resolve();
	await background;
	await expect(explicit).resolves.toBe(true);
	await expect(mismatched).resolves.toBe(false);
	expect(check).toHaveBeenCalledOnce();
	expect(download).toHaveBeenCalledOnce();
	expect(install).not.toHaveBeenCalled();
});

test.each([
	["android_install_permission_required", "permission"],
	["android_install_settings_unavailable", "settingsUnavailable"],
] as const)("Android keeps the checked APK when %s and retries explicitly", async (code, installIssue) => {
	const download = vi.fn(async () => {});
	const install = vi.fn<() => Promise<void>>().mockRejectedValueOnce({ code }).mockResolvedValueOnce(undefined);
	const updater = createUpdater({
		platform: "android",
		check: async () => ({ version: "0.3.99", required: false, download, install }),
	});
	await updater.check();
	await expect(updater.install()).resolves.toBe(false);
	expect(updater.getSnapshot()).toMatchObject({ status: "error", error: "install", installIssue, version: "0.3.99" });
	expect(install).toHaveBeenCalledOnce();
	expect(download).toHaveBeenCalledOnce();
	await expect(updater.install()).resolves.toBe(true);
	expect(download).toHaveBeenCalledOnce();
	expect(install).toHaveBeenCalledTimes(2);
	expect(updater.getSnapshot().status).toBe("installerOpened");
});
