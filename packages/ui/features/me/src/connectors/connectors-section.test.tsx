// @vitest-environment jsdom

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { expect, test, vi } from "vitest";
import { adapter, base, both, firstDevice, openCard, show, state } from "./connectors-section.fixtures.tsx";

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
		expect.objectContaining({
			connectorId: "local-files",
			scope: "device",
			capabilities: { fileTools: false, terminal: false, desktop: false, browser: false },
		}),
	);
	expect(state.create).toHaveBeenCalledWith(
		expect.objectContaining({
			connectorId: "computer-control",
			capabilities: { fileTools: true, terminal: false, desktop: false, browser: false },
		}),
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
		expect.objectContaining({
			connectorId: "computer-control",
			capabilities: { fileTools: true, terminal: false, desktop: false, browser: false },
		}),
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

test("the terminal is one more member of the computer card, granted by its own switch", async () => {
	show(adapter());
	const dialog = openCard("Connect · Computer access");
	fireEvent.click(within(dialog).getByRole("button", { name: /Windows PC/ }));
	const terminal = within(dialog).getByRole("switch", { name: /Terminal/ });
	await waitFor(() => expect(terminal).toBeEnabled());
	fireEvent.click(terminal);
	await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
	expect(state.create).toHaveBeenCalledWith(
		expect.objectContaining({
			connectorId: "computer-control",
			capabilities: { fileTools: false, terminal: true, desktop: false, browser: false },
		}),
	);
	// The row states the consequence in full, in front of the switch.
	expect(
		within(dialog).getByText(
			"Your Bot can run any command on this device as your system user, including deleting files and using the network.",
		),
	).toBeVisible();
});

test("turning the terminal off keeps the same grant's file tools", async () => {
	state.instances = [
		base,
		{
			...base,
			id: "con_b",
			connectorId: "computer-control",
			capabilities: { fileTools: true, terminal: true, desktop: false, browser: false },
		},
	];
	const native = adapter();
	state.update.mockResolvedValue({
		...base,
		id: "con_b",
		connectorId: "computer-control",
		revision: 2,
		capabilities: { fileTools: true, terminal: false, desktop: false, browser: false },
	});
	show(native);
	const dialog = openCard("Connected · Computer access");
	fireEvent.click(within(dialog).getByRole("button", { name: /Windows PC/ }));
	fireEvent.click(within(dialog).getByRole("switch", { name: /Terminal/ }));
	await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
	expect(state.update).toHaveBeenCalledWith({
		id: "con_b",
		expectedRevision: 1,
		capabilities: { fileTools: true, terminal: false, desktop: false, browser: false },
	});
	// Removing the grant would revoke the file tools too; the capability change is what is written.
	expect(state.remove).not.toHaveBeenCalled();
	// The device stores the changed grant again, so its local library matches the server.
	expect(native.authorize).toHaveBeenCalledWith(
		expect.objectContaining({ capabilities: { fileTools: true, terminal: false, desktop: false, browser: false } }),
	);
});

test("the master switch leaves the terminal alone", async () => {
	const native = adapter();
	show(native);
	const dialog = openCard("Connect · Computer access");
	fireEvent.click(within(dialog).getByRole("button", { name: /Windows PC/ }));
	// Granting every other capability does not grant the terminal: 2 creates, not 3.
	fireEvent.click(within(dialog).getByRole("switch", { name: "Windows PC" }));
	await waitFor(() => expect(state.create).toHaveBeenCalledTimes(2));
	expect(state.create).not.toHaveBeenCalledWith(
		expect.objectContaining({ capabilities: { fileTools: false, terminal: true, desktop: false, browser: false } }),
	);
});

test("a device platform without the terminal never shows the row", () => {
	state.devices = [{ ...firstDevice, platform: "linux" }];
	state.catalog = (["local-files", "computer-control"] as const).map((id) => ({
		id,
		name: id,
		description: id,
		kind: "device" as const,
		platforms: ["windows", "linux"] as ("windows" | "linux")[],
	}));
	show(adapter());
	const dialog = openCard("Connect · Computer access");
	fireEvent.click(within(dialog).getByRole("button", { name: /Windows PC/ }));
	expect(within(dialog).queryByRole("switch", { name: /Terminal/ })).toBeNull();
});

test("desktop control is one more member of the computer card, granted by its own switch", async () => {
	show(adapter());
	const dialog = openCard("Connect · Computer access");
	fireEvent.click(within(dialog).getByRole("button", { name: /Windows PC/ }));
	const desktop = within(dialog).getByRole("switch", { name: /Desktop control/ });
	await waitFor(() => expect(desktop).toBeEnabled());
	fireEvent.click(desktop);
	await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
	expect(state.create).toHaveBeenCalledWith(
		expect.objectContaining({
			connectorId: "computer-control",
			capabilities: { fileTools: false, terminal: false, desktop: true, browser: false },
		}),
	);
	// The row states the consequence in full, in front of the switch.
	expect(within(dialog).getByText("Your Bot can see the screen and operate the mouse and keyboard.")).toBeVisible();
});

test("turning desktop control off keeps the same grant's file tools and terminal", async () => {
	state.instances = [
		base,
		{
			...base,
			id: "con_b",
			connectorId: "computer-control",
			capabilities: { fileTools: true, terminal: true, desktop: true, browser: false },
		},
	];
	const native = adapter();
	state.update.mockResolvedValue({
		...base,
		id: "con_b",
		connectorId: "computer-control",
		revision: 2,
		capabilities: { fileTools: true, terminal: true, desktop: false, browser: false },
	});
	show(native);
	const dialog = openCard("Connected · Computer access");
	fireEvent.click(within(dialog).getByRole("button", { name: /Windows PC/ }));
	fireEvent.click(within(dialog).getByRole("switch", { name: /Desktop control/ }));
	await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
	expect(state.update).toHaveBeenCalledWith({
		id: "con_b",
		expectedRevision: 1,
		capabilities: { fileTools: true, terminal: true, desktop: false, browser: false },
	});
	expect(state.remove).not.toHaveBeenCalled();
});

test("the master switch leaves desktop control alone", async () => {
	const native = adapter();
	show(native);
	const dialog = openCard("Connect · Computer access");
	fireEvent.click(within(dialog).getByRole("button", { name: /Windows PC/ }));
	// Granting every other capability does not grant desktop control: 2 creates, not 3.
	fireEvent.click(within(dialog).getByRole("switch", { name: "Windows PC" }));
	await waitFor(() => expect(state.create).toHaveBeenCalledTimes(2));
	expect(state.create).not.toHaveBeenCalledWith(
		expect.objectContaining({ capabilities: { fileTools: false, terminal: false, desktop: true, browser: false } }),
	);
});

test("desktop control never shows on a platform without a desktop backend", () => {
	state.devices = [{ ...firstDevice, platform: "linux" }];
	state.catalog = (["local-files", "computer-control"] as const).map((id) => ({
		id,
		name: id,
		description: id,
		kind: "device" as const,
		platforms: ["windows", "linux"] as ("windows" | "linux")[],
	}));
	show(adapter());
	const dialog = openCard("Connect · Computer access");
	fireEvent.click(within(dialog).getByRole("button", { name: /Windows PC/ }));
	expect(within(dialog).queryByRole("switch", { name: /Desktop control/ })).toBeNull();
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

const secondDevice: DeviceSummary = { ...firstDevice, id: "dev_b", name: "Office PC", current: false };
const secondGrants: ConnectorInstance[] = both.map((item) => ({
	...item,
	id: `${item.id}_b`,
	deviceId: "dev_b",
	deviceName: "Office PC",
	currentDevice: false,
}));

test("a device with nothing granted offers a connect button that grants it", async () => {
	const native = adapter();
	show(native);
	const dialog = openCard("Connect · Computer access");
	fireEvent.click(within(dialog).getByRole("button", { name: "Connect" }));
	await waitFor(() => expect(state.create).toHaveBeenCalledTimes(2));
	expect(native.authorize).toHaveBeenCalledTimes(2);
});

test("an offline device shows a dropped-connection mark on the card and a retry in the panel", () => {
	state.devices = [{ ...firstDevice, current: false, status: "offline" }];
	state.instances = both.map((item) => ({ ...item, status: "offline" as const, currentDevice: false }));
	show(adapter());
	const card = screen.getByRole("button", { name: "Connected · Device offline · Computer access" });
	expect(within(card).getByTestId("connector-offline-icon")).toBeInTheDocument();
	const dialog = openCard("Connected · Device offline · Computer access");
	fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
	expect(state.refetch).toHaveBeenCalled();
});

test("a grant waiting for authorization can be cancelled and says so when it takes long", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		state.instances = both.map((item) => ({ ...item, status: "offline" as const }));
		const native = adapter();
		show(native);
		const dialog = openCard("Connected · Not ready · Computer access");
		expect(within(dialog).getByText("Waiting for authorization…")).toBeVisible();
		await act(async () => {
			vi.advanceTimersByTime(61_000);
		});
		expect(within(dialog).getByText(/Still not authorized/)).toBeVisible();
		fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(2));
		expect(native.revoke).toHaveBeenCalledWith("con_a", "local-files");
	} finally {
		vi.useRealTimers();
	}
});

test("closing one device leaves the other device's grants alone", async () => {
	state.devices = [{ ...firstDevice }, secondDevice];
	state.instances = [...both, ...secondGrants];
	show(adapter());
	const dialog = openCard("Connected · Computer access");
	fireEvent.click(within(dialog).getByRole("switch", { name: "Windows PC" }));
	await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(2));
	expect(state.remove).not.toHaveBeenCalledWith("con_a_b");
	expect(state.remove).not.toHaveBeenCalledWith("con_b_b");
});

test("close on all devices asks first, then removes every device's grants", async () => {
	state.devices = [{ ...firstDevice }, secondDevice];
	state.instances = [...both, ...secondGrants];
	const native = adapter();
	show(native);
	const dialog = openCard("Connected · Computer access");
	fireEvent.click(within(dialog).getByRole("button", { name: "Close on all devices" }));
	expect(state.remove).not.toHaveBeenCalled();
	fireEvent.click(await screen.findByRole("button", { name: "Close all" }));
	await waitFor(() => expect(state.remove).toHaveBeenCalledTimes(4));
	expect(native.revoke).toHaveBeenCalledTimes(2);
});

test("try it names the device when two are ready", () => {
	const tried = vi.fn();
	state.devices = [{ ...firstDevice }, secondDevice];
	state.instances = [...both, ...secondGrants];
	show(adapter(), tried);
	const dialog = openCard("Connected · Computer access");
	fireEvent.click(within(dialog).getByRole("button", { name: "Try it · Office PC" }));
	expect(tried).toHaveBeenCalledOnce();
	expect(tried.mock.calls[0]?.[0]).toContain("Office PC");
});

test("try it is disabled with a reason when no connected device is online", () => {
	state.devices = [{ ...firstDevice, current: false, status: "offline" }];
	state.instances = both.map((item) => ({ ...item, status: "offline" as const, currentDevice: false }));
	show(adapter(), vi.fn());
	const dialog = openCard("Connected · Device offline · Computer access");
	expect(within(dialog).getByRole("button", { name: "Try it" })).toBeDisabled();
	expect(within(dialog).getByText(/No connected device is online/)).toBeVisible();
});
