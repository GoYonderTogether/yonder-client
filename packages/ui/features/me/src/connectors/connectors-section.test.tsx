// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
	useDevices: () => ({
		data: { items: state.devices },
	}),
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
	name: "Documents",
	scope: "folder",
	capabilities: { fileTools: false },
	revision: 1,
	status: "online",
	currentDevice: true,
	createdAt: "2026-11-15T00:00:00Z",
};
function adapter(): LocalFilesAdapter {
	return {
		supported: true,
		authorize: vi.fn().mockResolvedValue(undefined),
		revoke: vi.fn().mockResolvedValue(undefined),
	};
}
function show(localFiles?: LocalFilesAdapter) {
	const open = vi.fn();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<ConnectorsSection localFiles={localFiles} onOpenDevices={open} />
		</I18nextProvider>,
	);
	return open;
}
function group(deviceId: string) {
	const element = document.getElementById(`connector-device-${deviceId}`);
	if (!element) throw new Error(`Missing device group ${deviceId}`);
	return element;
}
function openComputer(deviceId = "dev_a") {
	fireEvent.click(within(group(deviceId)).getByRole("button", { name: "Computer access" }));
}
const firstDevice: DeviceSummary = {
	id: "dev_a",
	name: "Windows PC",
	platform: "windows",
	current: true,
	status: "online",
	lastSeenAt: "2026-11-16T00:00:00Z",
	appVersion: "1",
};
beforeEach(() => {
	state.devices = [{ ...firstDevice }];
	state.instances = [];
	state.create.mockReset().mockImplementation(async (body) => {
		const saved = { ...base, ...body, id: `con_${body.connectorId}` };
		state.instances = [...state.instances, saved];
		return saved;
	});
	state.update
		.mockReset()
		.mockImplementation(async (body) => ({ ...base, ...body, revision: body.expectedRevision + 1 }));
	state.remove.mockReset().mockImplementation(async (id) => {
		state.instances = state.instances.filter((item) => item.id !== id);
		return { ok: true };
	});
});

test("one computer entry exposes only the two shipped permission choices, both off initially", () => {
	show(adapter());
	expect(within(group("dev_a")).getAllByRole("button")).toHaveLength(1);
	openComputer();
	const sheet = screen.getByRole("dialog", { name: "Computer access" });
	expect(within(sheet).getAllByRole("checkbox")).toHaveLength(2);
	expect(within(sheet).getByRole("checkbox", { name: "Read files" })).not.toBeChecked();
	expect(within(sheet).getByRole("checkbox", { name: "Modify files" })).not.toBeChecked();
	expect(within(sheet).getByRole("button", { name: "Apply permissions" })).toBeDisabled();
	expect(sheet.querySelector("details, form")).toBeNull();
	expect(screen.queryByText(/terminal/i)).toBeNull();
});

test.each([
	["Read files", "local-files", false],
	["Modify files", "computer-control", true],
] as const)("authorizes only the explicitly selected %s capability on this device", async (label, id, fileTools) => {
	const native = adapter();
	show(native);
	openComputer();
	fireEvent.click(screen.getByRole("checkbox", { name: label }));
	expect(state.create).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Apply permissions" }));
	await waitFor(() => expect(native.authorize).toHaveBeenCalledOnce());
	expect(state.create).toHaveBeenCalledExactlyOnceWith({
		connectorId: id,
		deviceId: "dev_a",
		name: "Windows PC",
		scope: "device",
		capabilities: { fileTools },
	});
});

test("removes write access without touching the existing read grant or another device", async () => {
	state.instances = [
		{ ...base, scope: "device" },
		{ ...base, id: "write_a", connectorId: "computer-control", scope: "device", capabilities: { fileTools: true } },
		{
			...base,
			id: "write_b",
			deviceId: "other",
			connectorId: "computer-control",
			scope: "device",
			capabilities: { fileTools: true },
		},
	];
	const native = adapter();
	show(native);
	openComputer();
	fireEvent.click(screen.getByRole("checkbox", { name: "Modify files" }));
	fireEvent.click(screen.getByRole("button", { name: "Apply permissions" }));
	await waitFor(() => expect(state.remove).toHaveBeenCalledExactlyOnceWith("write_a"));
	expect(native.revoke).toHaveBeenCalledExactlyOnceWith("write_a");
	expect(screen.getByRole("checkbox", { name: "Read files" })).toBeChecked();
	expect(state.create).not.toHaveBeenCalled();
});

test("legacy folder scope is preserved until the explicit upgrade action", async () => {
	state.instances = [base];
	const native = adapter();
	show(native);
	fireEvent.click(screen.getByRole("button", { name: "Manage Documents" }));
	expect(state.update).not.toHaveBeenCalled();
	expect(native.authorize).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: /^Connect$/ }));
	await waitFor(() =>
		expect(state.update).toHaveBeenCalledWith({
			id: "con_a",
			expectedRevision: 1,
			scope: "device",
			capabilities: { fileTools: false },
		}),
	);
});

test("failed native upgrade restores old scope at a fresh revision", async () => {
	state.instances = [base];
	const native = adapter();
	vi.mocked(native.authorize).mockRejectedValueOnce(new Error("failed"));
	show(native);
	fireEvent.click(screen.getByRole("button", { name: "Manage Documents" }));
	fireEvent.click(screen.getByRole("button", { name: /^Connect$/ }));
	await waitFor(() =>
		expect(state.update).toHaveBeenLastCalledWith({
			id: "con_a",
			expectedRevision: 2,
			scope: "folder",
			capabilities: { fileTools: false },
		}),
	);
	expect(native.authorize).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "folder", revision: 3 }));
	expect(await screen.findByRole("status")).toHaveTextContent("Could not finish connecting");
});

test("closing while creation is pending cleans up instead of granting late access", async () => {
	let finish: ((value: ConnectorInstance) => void) | undefined;
	state.create.mockReturnValue(
		new Promise<ConnectorInstance>((resolve) => {
			finish = resolve;
		}),
	);
	const native = adapter();
	show(native);
	openComputer();
	fireEvent.click(screen.getByRole("checkbox", { name: "Read files" }));
	fireEvent.click(screen.getByRole("button", { name: "Apply permissions" }));
	await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
	fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1) as HTMLElement);
	await act(async () => {
		finish?.({ ...base, scope: "device" });
	});
	await waitFor(() => expect(state.remove).toHaveBeenCalledWith("con_a"));
	expect(native.authorize).not.toHaveBeenCalled();
	expect(native.revoke).toHaveBeenCalledWith("con_a");
});

test("a failed rollback revokes local access instead of leaving an unconfirmed upgrade", async () => {
	state.instances = [base];
	state.update
		.mockResolvedValueOnce({ ...base, scope: "device", revision: 2 })
		.mockRejectedValueOnce(new Error("conflict"));
	const native = adapter();
	vi.mocked(native.authorize).mockRejectedValueOnce(new Error("failed"));
	show(native);
	fireEvent.click(screen.getByRole("button", { name: "Manage Documents" }));
	fireEvent.click(screen.getByRole("button", { name: /^Connect$/ }));
	await waitFor(() => expect(native.revoke).toHaveBeenCalledWith("con_a"));
	expect(await screen.findByRole("status")).toHaveTextContent("Could not finish connecting");
});

test("web only guides to the native device and never creates a grant", () => {
	state.devices[0] = { ...firstDevice, current: false };
	show();
	openComputer();
	expect(screen.queryByRole("button", { name: "Apply permissions" })).toBeNull();
	expect(screen.queryByRole("button", { name: "View devices" })).toBeNull();
	expect(state.create).not.toHaveBeenCalled();
});

test("same-name devices keep independent connected state by id, including offline instances", () => {
	state.devices.push({
		...firstDevice,
		id: "dev_b",
		current: false,
		status: "offline",
		lastSeenAt: "2026-11-16T00:01:00Z",
	});
	state.instances = [
		base,
		{
			...base,
			id: "con_b",
			connectorId: "computer-control",
			deviceId: "dev_b",
			currentDevice: false,
			scope: "device",
			capabilities: { fileTools: true },
			status: "offline",
		},
	];
	const native = adapter();
	show(native);
	expect(within(group("dev_a")).getByRole("button", { name: "Computer access" })).toBeVisible();
	openComputer("dev_b");
	expect(screen.getByRole("checkbox", { name: "Read files" })).not.toBeChecked();
	expect(screen.getByRole("checkbox", { name: "Modify files" })).toBeChecked();
	expect(screen.getByRole("checkbox", { name: "Read files" })).toBeDisabled();
	expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
	expect(screen.getByRole("status")).toHaveTextContent(/device is offline/i);
	expect(state.remove).not.toHaveBeenCalled();
	expect(native.revoke).not.toHaveBeenCalled();
});

test("revokes a remote offline grant without touching the local native adapter", async () => {
	state.devices.push({ ...firstDevice, id: "dev_b", current: false, status: "offline" });
	state.instances = [{ ...base, id: "con_b", deviceId: "dev_b", currentDevice: false, scope: "device" }];
	const native = adapter();
	show(native);
	openComputer("dev_b");
	fireEvent.click(screen.getByRole("checkbox", { name: "Read files" }));
	fireEvent.click(screen.getByRole("button", { name: "Apply permissions" }));
	await waitFor(() => expect(state.remove).toHaveBeenCalledExactlyOnceWith("con_b"));
	expect(native.revoke).not.toHaveBeenCalled();
	expect(native.authorize).not.toHaveBeenCalled();
	expect(state.create).not.toHaveBeenCalled();
});

test("a remote device never receives a fake local grant even when this adapter is supported", () => {
	state.devices.push({ ...firstDevice, id: "dev_b", name: "Work computer", remark: "Studio computer", current: false });
	const native = adapter();
	show(native);
	expect(screen.getByRole("link", { name: "Studio computer" })).toBeVisible();
	expect(within(group("dev_b")).getByRole("heading", { name: "Studio computer" })).toBeVisible();
	openComputer("dev_b");
	expect(screen.getByText("Continue in Yonder on Studio computer to enable this connector.")).toBeVisible();
	expect(screen.queryByRole("button", { name: "Apply permissions" })).toBeNull();
	expect(state.create).not.toHaveBeenCalled();
	expect(native.authorize).not.toHaveBeenCalled();
});

test("web and unsupported devices are absent from both device navigation and sections", () => {
	const other = { ...firstDevice, id: "dev_b", name: "Work computer", current: false };
	state.devices = [
		{ ...firstDevice, id: "web", name: "Browser", platform: "web" },
		{ ...firstDevice, id: "phone", name: "iPhone", platform: "ios", current: false },
		{ ...firstDevice, current: false },
		other,
	];
	show();
	const nav = screen.getByRole("navigation", { name: "Device" });
	expect(within(nav).getAllByRole("link")).toHaveLength(2);
	expect(screen.queryByRole("region", { name: /Browser|iPhone/ })).toBeNull();
	expect(within(nav).getByRole("link", { name: "Windows PC" })).toHaveAttribute("aria-current", "true");
	const link = within(nav).getByRole("link", { name: other.name });
	const target = group(other.id);
	const scroll = vi.fn();
	target.scrollIntoView = scroll;
	const hash = location.hash;
	fireEvent.click(link);
	expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
	expect(location.hash).toBe(hash);
	expect(target).toHaveFocus();
	expect(link).toHaveAttribute("aria-current", "true");
	expect(within(group("dev_a")).getByRole("button", { name: "Computer access" })).toBeVisible();
	expect(screen.queryByRole("combobox")).toBeNull();
	expect(screen.queryByRole("tab")).toBeNull();
	expect(state.create).not.toHaveBeenCalled();
});

test("shows the connector empty state when all signed-in devices are unsupported", () => {
	state.devices = [{ ...firstDevice, id: "phone", name: "iPhone", platform: "ios" }];
	show();
	expect(screen.queryByRole("navigation", { name: "Device" })).toBeNull();
	expect(screen.queryByRole("region", { name: /iPhone/ })).toBeNull();
	expect(screen.getByText("No connectors available")).toBeVisible();
});

test.each(["online", "offline"] as const)(
	"an already-connected %s remote device does not ask to enable again",
	(status) => {
		state.devices.push({ ...firstDevice, id: "dev_b", name: "Work computer", current: false, status });
		state.instances = [
			{
				...base,
				id: "con_b",
				deviceId: "dev_b",
				deviceName: "Work computer",
				scope: "device",
				currentDevice: false,
				status,
			},
		];
		show(adapter());
		openComputer("dev_b");
		expect(
			within(screen.getByRole("dialog", { name: "Computer access" })).queryByRole("button", { name: "Try it" }),
		).toBeNull();
		expect(screen.getByRole("checkbox", { name: "Read files" })).toBeChecked();
		expect(state.create).not.toHaveBeenCalled();
	},
);

test("a supported current platform with no native adapter offers guidance without creating", () => {
	show();
	openComputer();
	expect(screen.getByText("Continue in Yonder on Windows PC to enable this connector.")).toBeVisible();
	expect(screen.queryByRole("button", { name: "Apply permissions" })).toBeNull();
	expect(state.create).not.toHaveBeenCalled();
});

test("all legacy folder instances remain manageable and disappearing device/instance closes details", () => {
	state.instances = [base, { ...base, id: "con_second", name: "Other folder" }];
	const content = (
		<I18nextProvider i18n={createI18n("en")}>
			<ConnectorsSection localFiles={adapter()} />
		</I18nextProvider>
	);
	const view = render(content);
	expect(screen.getByRole("button", { name: "Manage Documents" })).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "Manage Other folder" }));
	state.instances = [base];
	view.rerender(
		<I18nextProvider i18n={createI18n("en")}>
			<ConnectorsSection localFiles={adapter()} />
		</I18nextProvider>,
	);
	expect(screen.queryByRole("dialog")).toBeNull();
	openComputer();
	state.devices = [];
	view.rerender(
		<I18nextProvider i18n={createI18n("en")}>
			<ConnectorsSection localFiles={adapter()} />
		</I18nextProvider>,
	);
	expect(screen.queryByRole("dialog")).toBeNull();
	// An orphaned grant cannot add a device to the overview.
	expect(screen.getByText("No devices yet")).toBeVisible();
	expect(screen.queryByRole("radio", { name: "By connector" })).toBeNull();
	state.instances = [];
	view.rerender(
		<I18nextProvider i18n={createI18n("en")}>
			<ConnectorsSection localFiles={adapter()} />
		</I18nextProvider>,
	);
	expect(screen.getByText("No devices yet")).toBeVisible();
});
