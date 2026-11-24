// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";
import { UpdateControls, UpdateControlsView } from "./controls.tsx";
import { updatePlatform } from "./drivers.ts";
import { UpdateProvider } from "./provider.tsx";
import { createUpdater, type UpdateCandidate } from "./state.ts";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

function renderControls(updater: ReturnType<typeof createUpdater>) {
	return render(
		<I18nextProvider i18n={createI18n("zh-CN")}>
			<UpdateControlsView updater={updater} />
		</I18nextProvider>,
	);
}

test("web and iOS have no updater controls or check", () => {
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0", maxTouchPoints: 0 });
	expect(updatePlatform()).toBeNull();
	Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
	vi.stubGlobal("navigator", {
		userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)",
		maxTouchPoints: 5,
	});
	expect(updatePlatform()).toBeNull();
	const view = render(
		<I18nextProvider i18n={createI18n("zh-CN")}>
			<UpdateProvider>
				<UpdateControls />
			</UpdateProvider>
		</I18nextProvider>,
	);
	expect(view.container).toBeEmptyDOMElement();
});

test("desktop shows the downloaded version and a user-controlled restart", async () => {
	const confirm = vi.spyOn(window, "confirm");
	const install = vi.fn(async () => {});
	const candidate: UpdateCandidate = { version: "0.3.12", required: false, download: async () => {}, install };
	const updater = createUpdater({ platform: "desktop", check: async () => candidate });
	renderControls(updater);
	fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
	expect(await screen.findByText("版本 0.3.12 已下载")).toBeInTheDocument();
	expect(install).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "重启并安装" }));
	expect(install).not.toHaveBeenCalled();
	expect(confirm).not.toHaveBeenCalled();
	expect(screen.getByRole("dialog")).toHaveTextContent("正在录音会先保存，重启后自动接着录");
	fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }));
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	fireEvent.click(screen.getByRole("button", { name: "重启并安装" }));
	fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "重启并安装" }));
	await waitFor(() => expect(install).toHaveBeenCalledOnce());
});

test("Android shows available update and opens the installer only after confirmation", async () => {
	let finish!: () => void;
	const done = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const download = vi.fn(async (progress: (downloaded: number, total: number) => void) => {
		progress(3, 4);
		await done;
	});
	const candidate: UpdateCandidate = { version: "0.3.12", required: true, download, install: vi.fn(async () => {}) };
	const updater = createUpdater({ platform: "android", check: async () => candidate });
	renderControls(updater);
	fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
	expect(await screen.findByText("请更新至 0.3.12 以继续获得支持")).toBeInTheDocument();
	expect(download).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "下载安装" }));
	expect(await screen.findByText("正在下载 75%")).toBeInTheDocument();
	finish();
	expect(await screen.findByText("请在系统安装界面继续")).toBeInTheDocument();
	expect(download).toHaveBeenCalledOnce();
});

test("Android explains permission denial and retries an already downloaded update", async () => {
	const download = vi.fn(async () => {});
	const install = vi
		.fn<() => Promise<void>>()
		.mockRejectedValueOnce({ code: "android_install_permission_required" })
		.mockResolvedValueOnce(undefined);
	const updater = createUpdater({
		platform: "android",
		check: async () => ({ version: "0.3.12", required: false, download, install }),
	});
	renderControls(updater);
	fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
	fireEvent.click(await screen.findByRole("button", { name: "下载安装" }));
	expect(await screen.findByText("请在安卓设置中允许 Yonder 安装应用，然后重试。")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "安装更新" }));
	expect(await screen.findByText("请在系统安装界面继续")).toBeInTheDocument();
	expect(download).toHaveBeenCalledOnce();
	expect(install).toHaveBeenCalledTimes(2);
});
