// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";
import { UpdateControls, UpdateControlsView } from "./controls.tsx";
import { updatePlatform } from "./drivers.ts";
import { UpdateProvider } from "./provider.tsx";
import { createUpdater, type UpdateCandidate } from "./state.ts";

afterEach(() => {
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
	const install = vi.fn(async () => {});
	const candidate: UpdateCandidate = { version: "0.3.12", required: false, download: async () => {}, install };
	const updater = createUpdater({ platform: "desktop", check: async () => candidate });
	renderControls(updater);
	fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
	expect(await screen.findByText("版本 0.3.12 已下载")).toBeInTheDocument();
	expect(install).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "重启并安装" }));
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
	const candidate: UpdateCandidate = { version: "0.3.12", required: true, download };
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
