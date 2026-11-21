// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ConnectorRequestView } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
	request: null as unknown,
	devices: { items: [] as unknown[] },
	devicesError: false,
	confirm: vi.fn(),
	cancel: vi.fn(),
	resume: vi.fn(),
	refetch: vi.fn(),
}));
vi.mock("@yonder/ui-data", async (original) => {
	const actual = await original<typeof import("@yonder/ui-data")>();
	return {
		...actual,
		useConnectorRequest: () => ({ data: state.request, isPending: false, refetch: state.refetch }),
		useConnectorRequestDevices: () => ({ data: state.devices, isError: state.devicesError, isPending: false }),
		useConnectorRequestActions: () => ({
			confirm: { mutate: state.confirm, isPending: false, error: null, variables: undefined },
			cancel: { mutate: state.cancel, isPending: false, error: null },
			resume: { mutate: state.resume, isPending: false, error: null },
		}),
	};
});

import { ApiError } from "@yonder/ui-data";
import { ConnectorRequestCard } from "./connector-request-card.tsx";

function view(overrides: Partial<ConnectorRequestView> = {}): ConnectorRequestView {
	return {
		id: "request",
		connectorIds: ["local-files"],
		reason: "Need to read the quarterly notes",
		state: "pending",
		deviceId: null,
		deviceName: null,
		connectionIds: [],
		failure: null,
		...overrides,
	};
}
function show() {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<ConnectorRequestCard id="request" />
		</I18nextProvider>,
	);
}
beforeEach(() => {
	state.request = view();
	state.devices = { items: [] };
	state.devicesError = false;
	state.confirm.mockReset();
	state.cancel.mockReset();
	state.refetch.mockReset();
});
afterEach(() => vi.clearAllMocks());

test("shows the connectors, the Bot's reason and the capability line, never the user's own words", () => {
	state.request = view({ connectorIds: ["local-files", "computer-control"] });
	show();
	expect(screen.getByText("Bot requests connector access")).toBeVisible();
	expect(screen.getByText("Read files · Modify files")).toBeVisible();
	expect(screen.getByText("Need to read the quarterly notes")).toBeVisible();
	expect(screen.getByText(/shares files across the selected device/)).toBeVisible();
	expect(screen.getByText(/recoverably delete files across the selected device/)).toBeVisible();
	expect(screen.queryByText(/Read my files/)).toBeNull();
});

test("allowing is the consent and does not wait for the Bot or navigate anywhere", () => {
	show();
	fireEvent.click(screen.getByRole("button", { name: "Allow" }));
	expect(state.confirm).toHaveBeenCalledWith({ id: "request", connectorIds: ["local-files"] }, expect.anything());
});

test.each([
	{ connectorIds: undefined },
	{ connectorIds: [] },
	{ connectorIds: ["unknown"] },
	{ connectorIds: [["local-files"]] },
])("offers a local retry for undisplayable connector scopes %j", ({ connectorIds }) => {
	state.request = { ...view(), connectorId: "local-files", connectorIds };
	show();
	expect(screen.getByRole("alert")).toBeVisible();
	expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(state.refetch).toHaveBeenCalledOnce();
	expect(state.confirm).not.toHaveBeenCalled();
});

test("a device_required answer lists the usable devices once so the user picks one", () => {
	state.devices = {
		items: [
			{ id: "dev_mac", name: "MacBook Pro", platform: "macos", online: true, supported: true },
			{ id: "dev_win", name: "Studio PC", platform: "windows", online: true, supported: true },
			{ id: "dev_off", name: "Old laptop", platform: "macos", online: false, supported: true },
		],
	};
	state.confirm.mockImplementation((_body, options) => {
		if (!options) return;
		options.onError(new ApiError({ code: "device_required", status: 409, message: "device_required" }));
	});
	show();
	fireEvent.click(screen.getByRole("button", { name: "Allow" }));
	expect(screen.getByText("Choose a device")).toBeVisible();
	expect(screen.queryByRole("button", { name: "Old laptop" })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Studio PC" }));
	expect(state.confirm).toHaveBeenLastCalledWith(
		{ id: "request", connectorIds: ["local-files"], deviceId: "dev_win" },
		expect.anything(),
	);
});

test("a device_offline answer keeps the card pending and says the device is offline", () => {
	state.confirm.mockImplementation((_body, options) => {
		options?.onError(new ApiError({ code: "device_offline", status: 409, message: "device_offline" }));
	});
	show();
	fireEvent.click(screen.getByRole("button", { name: "Allow" }));
	expect(screen.getByText(/target device is offline/i)).toBeVisible();
	expect(screen.getByRole("button", { name: "Allow" })).toBeEnabled();
	expect(screen.getByText("Waiting for you")).toBeVisible();
});

test("a dispatched request waits for the device and can only be cancelled", () => {
	state.request = view({ state: "dispatched", deviceId: "dev_mac", deviceName: "MacBook Pro" });
	show();
	expect(screen.getByText("Waiting for the device")).toBeVisible();
	expect(screen.getByText("Device: MacBook Pro")).toBeVisible();
	expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(state.cancel).toHaveBeenCalledWith("request");
});

test("a granted request is final and offers no further action", () => {
	state.request = view({ state: "granted", deviceId: "dev_mac", deviceName: "MacBook Pro" });
	show();
	expect(screen.getByText("Allowed")).toBeVisible();
	expect(screen.queryByRole("button")).toBeNull();
});

test("continuation starts silently and retries the original task without reenabling device access", () => {
	const locale = createI18n("en");
	const card = () => (
		<I18nextProvider i18n={locale}>
			<ConnectorRequestCard id="request" />
		</I18nextProvider>
	);
	state.request = view({ state: "granted", continuation: "pending" });
	const { rerender } = render(card());
	expect(screen.getByText("Device authorized. Resuming the task…")).toBeVisible();
	expect(screen.queryByRole("button")).toBeNull();
	expect(screen.queryByRole("alert")).toBeNull();

	state.request = view({ state: "granted", continuation: "failed" });
	rerender(card());
	expect(screen.getByText("Device authorized. The task has not resumed.")).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "Continue task" }));
	expect(state.resume).toHaveBeenCalledExactlyOnceWith("request");
	expect(state.confirm).not.toHaveBeenCalled();

	state.request = view({ state: "granted", continuation: "started" });
	rerender(card());
	expect(screen.getByText("Device authorized. Task submitted.")).toBeVisible();
	expect(screen.queryByRole("button")).toBeNull();
});

test.each([
	["grant_changed", "Device permissions changed. The task did not resume."],
	["target_unavailable", "The original conversation is unavailable. The task did not resume."],
] as const)("shows why the task can no longer continue after %s", (continuationFailure, label) => {
	state.request = view({ state: "granted", continuation: "failed", continuationFailure });
	show();
	expect(screen.getByText(label)).toBeVisible();
	expect(screen.queryByRole("button")).toBeNull();
});

test("expired retries through confirm with the connectors the card shows, free to pick another device", () => {
	state.request = view({ state: "expired", deviceId: "dev_mac", deviceName: "MacBook Pro" });
	show();
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	// No device: the server starts a new dispatch and may pick a different one.
	expect(state.confirm).toHaveBeenCalledWith({ id: "request", connectorIds: ["local-files"] }, expect.anything());
});

test("failed shows the real reason and retries with the connectors the card shows", () => {
	state.request = view({
		state: "failed",
		connectorIds: ["local-files", "computer-control"],
		failure: "permission_denied",
	});
	show();
	expect(screen.getByRole("alert")).toHaveTextContent("permission_denied");
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(state.confirm).toHaveBeenCalledWith(
		{ id: "request", connectorIds: ["local-files", "computer-control"] },
		expect.anything(),
	);
});

test("request_changed shows the card the server has now instead of a stale allow button", () => {
	state.confirm.mockImplementation((_body, options) => {
		options?.onError(new ApiError({ code: "request_changed", status: 409, message: "request_changed" }));
	});
	show();
	expect(screen.queryByText(/create, edit and recoverably delete files across the selected device/)).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Allow" }));
	expect(state.refetch).toHaveBeenCalled();
});

test("cancelled is final", () => {
	state.request = view({ state: "cancelled" });
	show();
	expect(screen.getByText("Cancelled")).toBeVisible();
	expect(screen.queryByRole("button")).toBeNull();
});
