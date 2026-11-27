// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";
import { ConnectorsSection } from "./connectors-section.tsx";
import type { LocalFilesAdapter } from "./local-files-adapter.ts";

const state = vi.hoisted(() => ({
	devices: [] as DeviceSummary[],
	instances: [] as ConnectorInstance[],
	create: vi.fn(),
	update: vi.fn(),
	remove: vi.fn(),
}));
vi.mock("@yonder/ui-data", () => ({
	useConnectorCatalog: () => ({
		data: {
			items: ["local-files", "computer-control"].map((id) => ({
				id,
				name: id,
				description: id,
				kind: "device",
				platforms: ["windows"],
			})),
		},
	}),
	useConnectors: () => ({ data: { items: state.instances } }),
	useDevices: () => ({ data: { items: state.devices } }),
	useConnectorActions: () => ({
		create: { mutateAsync: state.create },
		update: { mutateAsync: state.update },
		remove: { mutateAsync: state.remove },
	}),
}));
vi.mock("@yonder/ui-shell", async (original) => ({
	...(await original<object>()),
	useShellChrome: () => ({ mode: "wide" }),
}));
const base: ConnectorInstance = {
	id: "con_a",
	connectorId: "local-files",
	deviceId: "dev_a",
	deviceName: "Windows PC",
	name: "Windows PC",
	scope: "device",
	capabilities: { fileTools: false },
	revision: 1,
	status: "online",
	currentDevice: true,
	createdAt: "2026-11-15T00:00:00Z",
};
const both: ConnectorInstance[] = [
	base,
	{ ...base, id: "con_b", connectorId: "computer-control", capabilities: { fileTools: true } },
];
const firstDevice: DeviceSummary = {
	id: "dev_a",
	name: "Windows PC",
	platform: "windows",
	current: true,
	status: "online",
	lastSeenAt: "2026-11-16T00:00:00Z",
	appVersion: "1",
};
function adapter(): LocalFilesAdapter {
	return {
		supported: true,
		authorize: vi.fn().mockResolvedValue(undefined),
		revoke: vi.fn().mockResolvedValue(undefined),
	};
}
function show(localFiles?: LocalFilesAdapter) {
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<ConnectorsSection localFiles={localFiles} />
		</I18nextProvider>,
	);
}
function openCard(name: string) {
	fireEvent.click(screen.getByRole("button", { name }));
	return screen.getByRole("dialog", { name: "Computer access" });
}
beforeEach(() => {
	state.devices = [{ ...firstDevice }];
	state.instances = [];
	state.create.mockReset().mockImplementation(async (body) => ({ ...base, ...body }));
	state.update.mockReset();
	state.remove.mockReset().mockResolvedValue({ ok: true });
});

test("reading and modifying files are one computer card per device", () => {
	show(adapter());
	expect(screen.getByRole("button", { name: "Connect · Computer access" })).toBeVisible();
	expect(screen.queryByRole("button", { name: /Read files|Modify files/ })).toBeNull();
});

test("the master switch grants every capability of the device", async () => {
	const native = adapter();
	show(native);
	const dialog = openCard("Connect · Computer access");
	fireEvent.click(within(dialog).getByRole("switch", { name: "Windows PC" }));
	await waitFor(() => expect(state.create).toHaveBeenCalledTimes(2));
	expect(state.create).toHaveBeenCalledWith(
		expect.objectContaining({ connectorId: "local-files", scope: "device", capabilities: { fileTools: false } }),
	);
	expect(state.create).toHaveBeenCalledWith(
		expect.objectContaining({ connectorId: "computer-control", capabilities: { fileTools: true } }),
	);
	expect(native.authorize).toHaveBeenCalledTimes(2);
});

test("tapping the row opens its switches and one switch grants one capability", async () => {
	show(adapter());
	const dialog = openCard("Connect · Computer access");
	expect(within(dialog).queryByRole("switch", { name: "Modify files" })).toBeNull();
	fireEvent.click(within(dialog).getByRole("button", { name: /Windows PC/ }));
	fireEvent.click(within(dialog).getByRole("switch", { name: /Modify files/ }));
	await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
	expect(state.create).toHaveBeenCalledWith(
		expect.objectContaining({ connectorId: "computer-control", capabilities: { fileTools: true } }),
	);
});

test("turning the master switch off revokes locally and removes every grant", async () => {
	state.instances = both;
	const native = adapter();
	show(native);
	const dialog = openCard("Connected · Computer access");
	fireEvent.click(within(dialog).getByRole("switch", { name: "Windows PC" }));
	await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(2));
	expect(native.revoke).toHaveBeenCalledWith("con_a", "local-files");
	expect(native.revoke).toHaveBeenCalledWith("con_b", "computer-control");
});

test("an offline device says so once in its heading and greys its card", () => {
	state.devices = [{ ...firstDevice, current: false, status: "offline" }];
	state.instances = both.map((item) => ({ ...item, status: "offline" as const, currentDevice: false }));
	show(adapter());
	expect(within(screen.getByRole("region", { name: "Windows PC" })).getByText(/Offline/)).toBeVisible();
	expect(screen.getByRole("button", { name: "Connected · Device offline · Computer access" })).toBeVisible();
});

test("web and unsupported devices get no section", () => {
	state.devices = [
		{ ...firstDevice, id: "web", name: "Browser", platform: "web" },
		{ ...firstDevice, id: "phone", name: "iPhone", platform: "ios", current: false },
		firstDevice,
	];
	show(adapter());
	expect(screen.getAllByRole("region")).toHaveLength(1);
	expect(within(screen.getByRole("navigation", { name: "Device" })).getAllByRole("button")).toHaveLength(1);
});

test("shows the empty state when no signed-in device can connect", () => {
	state.devices = [{ ...firstDevice, id: "phone", name: "iPhone", platform: "ios" }];
	show();
	expect(screen.queryByRole("navigation", { name: "Device" })).toBeNull();
	expect(screen.getByText("No connectors available")).toBeVisible();
});
