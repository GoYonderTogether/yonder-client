// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";
import { UpdateReadyButtonView } from "./ready-button.tsx";
import { createUpdater } from "./state.ts";

afterEach(() => vi.restoreAllMocks());

test("ready shortcut requires explicit restart consent and supports installation retry", async () => {
	const install = vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValue(undefined);
	const confirm = vi.spyOn(window, "confirm");
	const updater = createUpdater({
		platform: "desktop",
		check: async () => ({ version: "0.3.12", required: false, download: async () => {}, install }),
	});
	render(
		<I18nextProvider i18n={createI18n("zh-CN")}>
			<UpdateReadyButtonView updater={updater} />
		</I18nextProvider>,
	);
	expect(screen.queryByRole("button")).toBeNull();
	await act(() => updater.check());
	const button = screen.getByRole("button", { name: /版本 0.3.12 已下载/ });
	expect(button).toHaveClass("size-11", "rounded-full");
	expect(button.firstElementChild).toHaveClass("size-[var(--control-sm)]", "rounded-full", "bg-[var(--color-accent)]");
	expect(button.querySelector("svg")).toHaveAttribute("width", "20");
	expect(button.querySelector("svg")).toHaveAttribute("stroke-width", "1.7");
	fireEvent.click(button);
	expect(screen.getByRole("dialog")).toHaveTextContent("正在录音会先保存，重启后自动接着录");
	expect(confirm).not.toHaveBeenCalled();
	fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }));
	expect(install).not.toHaveBeenCalled();
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	fireEvent.click(button);
	fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "重启并安装" }));
	await waitFor(() => expect(updater.getSnapshot().status).toBe("error"));
	expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("未能完成安装或重启");
	fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "重启并安装" }));
	await waitFor(() => expect(install).toHaveBeenCalledTimes(2));
	expect(screen.getByRole("dialog")).toBeInTheDocument();
});

test("Android has no desktop restart shortcut", async () => {
	const updater = createUpdater({
		platform: "android",
		check: async () => ({ version: "0.3.12", required: false, download: async () => {} }),
	});
	await updater.check();
	const view = render(
		<I18nextProvider i18n={createI18n("en")}>
			<UpdateReadyButtonView updater={updater} />
		</I18nextProvider>,
	);
	expect(view.container).toBeEmptyDOMElement();
});

test("download progress is non-interactive, honest about unknown size, and turns ready only on completion", async () => {
	let report!: (downloaded: number, total: number) => void;
	let complete!: () => void;
	const install = vi.fn();
	const updater = createUpdater({
		platform: "desktop",
		check: async () => ({
			version: "0.3.12",
			required: false,
			install,
			download: (progress) => {
				report = progress;
				return new Promise<void>((resolve) => {
					complete = resolve;
				});
			},
		}),
	});
	render(
		<I18nextProvider i18n={createI18n("zh-CN")}>
			<UpdateReadyButtonView updater={updater} />
		</I18nextProvider>,
	);
	let checking!: Promise<void>;
	await act(async () => {
		checking = updater.check();
	});
	const progress = screen.getByRole("progressbar");
	expect(progress).not.toHaveAttribute("aria-valuenow");
	expect(progress).not.toHaveTextContent("%");
	expect(screen.queryByRole("button")).toBeNull();
	act(() => report(37, 100));
	expect(progress).toHaveAttribute("aria-valuenow", "37");
	expect(progress).toHaveTextContent("37%");
	expect(progress.querySelector('[pathLength="100"]')).toHaveAttribute("stroke-dasharray", "37 100");
	act(() => report(100, 100));
	expect(screen.queryByRole("button")).toBeNull();
	await act(async () => {
		complete();
		await checking;
	});
	expect(screen.queryByRole("progressbar")).toBeNull();
	expect(screen.getByRole("button", { name: /版本 0.3.12 已下载/ })).toBeEnabled();
	expect(install).not.toHaveBeenCalled();
});

test("failed downloads stay visible without exposing an install action", async () => {
	const updater = createUpdater({
		platform: "desktop",
		check: async () => ({
			version: "0.3.12",
			required: false,
			download: async () => {
				throw new Error("offline");
			},
		}),
	});
	render(
		<I18nextProvider i18n={createI18n("zh-CN")}>
			<UpdateReadyButtonView updater={updater} />
		</I18nextProvider>,
	);
	await act(() => updater.check());
	expect(screen.getByRole("status")).toHaveTextContent("下载失败");
	expect(screen.queryByRole("button")).toBeNull();
});
