// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";
import { UpdateReadyButtonView } from "./ready-button.tsx";
import { createUpdater } from "./state.ts";

afterEach(() => vi.restoreAllMocks());

test("ready shortcut requires explicit restart consent and supports installation retry", async () => {
	const install = vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValue(undefined);
	const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
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
	expect(button).toHaveClass("rounded-full", "bg-[var(--color-accent)]");
	fireEvent.click(button);
	expect(confirm).toHaveBeenCalledWith(expect.stringContaining("录音、上传及本地任务"));
	expect(install).not.toHaveBeenCalled();
	confirm.mockReturnValue(true);
	fireEvent.click(button);
	await waitFor(() => expect(updater.getSnapshot().status).toBe("error"));
	fireEvent.click(screen.getByRole("button"));
	await waitFor(() => expect(install).toHaveBeenCalledTimes(2));
	expect(screen.queryByRole("button")).toBeNull();
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
