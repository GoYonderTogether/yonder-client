// @vitest-environment jsdom

import { fireEvent, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { adapter, base, openCard, show, state } from "./connectors-section.fixtures.tsx";

test("the browser row is one more member and carries the install hint when bsk is missing", async () => {
	const native = adapter();
	const status = vi.fn().mockResolvedValue({
		installed: false,
		daemonRunning: false,
		connected: false,
		hint: "点卡片上的「安装浏览器控制」装好 bsk，再在 Chrome 或 Edge 里装上 BrowserSkill 扩展。",
		install: { program: "sh", args: ["-c", "curl … | sh"] },
	});
	native.browserStatus = status;
	const install = vi.fn().mockResolvedValue(undefined);
	native.installBrowser = install;
	show(native);
	const dialog = openCard("Connect · Computer access");
	fireEvent.click(within(dialog).getByRole("button", { name: /Windows PC/ }));
	// The row says what it allows, and — because bsk is missing — the next step and one install button.
	const row = await within(dialog).findByRole("switch", { name: /Browser control/ });
	expect(row).toBeEnabled();
	expect(within(dialog).getByText(/Your Bot can open pages, click and type in your browser\./)).toBeVisible();
	await waitFor(() =>
		expect(
			within(dialog).getByText(/点卡片上的「安装浏览器控制」装好 bsk，再在 Chrome 或 Edge 里装上 BrowserSkill 扩展。/),
		).toBeVisible(),
	);
	fireEvent.click(within(dialog).getByRole("button", { name: "Install browser control" }));
	await waitFor(() => expect(install).toHaveBeenCalledOnce());
	// Install sits inside the row's label; pressing it must not also flip the switch and grant access.
	expect(state.create).not.toHaveBeenCalled();
	expect(row).not.toBeChecked();
});

test("the browser row grants the browser capability through its own switch", async () => {
	const native = adapter();
	native.browserStatus = vi.fn().mockResolvedValue({
		installed: true,
		daemonRunning: true,
		connected: true,
		hint: "浏览器已连上，Bot 可以在你的浏览器里打开页面、点击和输入。",
	});
	show(native);
	const dialog = openCard("Connect · Computer access");
	fireEvent.click(within(dialog).getByRole("button", { name: /Windows PC/ }));
	const row = await within(dialog).findByRole("switch", { name: /Browser control/ });
	await waitFor(() => expect(row).toBeEnabled());
	fireEvent.click(row);
	await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
	expect(state.create).toHaveBeenCalledWith(
		expect.objectContaining({
			connectorId: "computer-control",
			capabilities: { fileTools: false, terminal: false, browser: true, desktop: false },
		}),
	);
});

test("turning browser control off keeps the same grant's file tools and terminal", async () => {
	state.instances = [
		base,
		{
			...base,
			id: "con_b",
			connectorId: "computer-control",
			capabilities: { fileTools: true, terminal: true, browser: true, desktop: false },
		},
	];
	const native = adapter();
	native.browserStatus = vi.fn().mockResolvedValue({
		installed: true,
		daemonRunning: true,
		connected: true,
		hint: "ok",
	});
	state.update.mockResolvedValue({
		...base,
		id: "con_b",
		connectorId: "computer-control",
		revision: 2,
		capabilities: { fileTools: true, terminal: true, browser: false, desktop: false },
	});
	show(native);
	const dialog = openCard("Connected · Computer access");
	fireEvent.click(within(dialog).getByRole("button", { name: /Windows PC/ }));
	fireEvent.click(within(dialog).getByRole("switch", { name: /Browser control/ }));
	await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
	expect(state.update).toHaveBeenCalledWith({
		id: "con_b",
		expectedRevision: 1,
		capabilities: { fileTools: true, terminal: true, browser: false, desktop: false },
	});
	expect(state.remove).not.toHaveBeenCalled();
});
