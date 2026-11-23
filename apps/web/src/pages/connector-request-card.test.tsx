// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ConnectorRequestDevice, ConnectorRequestView } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
	request: null as unknown,
	devices: { items: [] as ConnectorRequestDevice[] },
	confirm: vi.fn(),
	cancel: vi.fn(),
	resume: vi.fn(),
	refetch: vi.fn(),
	refreshDevices: vi.fn(),
}));
vi.mock("@yonder/ui-data", async (original) => {
	const actual = await original<typeof import("@yonder/ui-data")>();
	return {
		...actual,
		useConnectorRequest: () => ({ data: state.request, isPending: false, refetch: state.refetch }),
		useConnectorRequestDevices: () => ({
			data: state.devices,
			isError: false,
			isPending: false,
			refetch: state.refreshDevices,
		}),
		useConnectorRequestActions: () => ({
			confirm: { mutate: state.confirm, isPending: false, error: null },
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

const mac: ConnectorRequestDevice = {
	id: "dev_mac",
	name: "MacBook Pro",
	platform: "macos",
	online: true,
	supported: true,
};
const pc: ConnectorRequestDevice = {
	id: "dev_pc",
	name: "Studio PC",
	platform: "windows",
	online: true,
	supported: true,
};
beforeEach(() => {
	state.request = view();
	state.devices = { items: [mac] };
	vi.resetAllMocks();
});

const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const choose = (name: string) => screen.queryByRole("button", { name });
const selectDevice = (name: string) => fireEvent.click(screen.getByRole("radio", { name }));

test("a single known device shows the reason and full scope, then authorizes that device explicitly", () => {
	state.request = view({
		connectorIds: ["local-files", "computer-control"],
		reason: "Need to read the quarterly notes. Then combine them in one file.",
	});
	show();
	expect(screen.getByText("Allow reading and modifying files on MacBook Pro?")).toBeVisible();
	expect(screen.getByText(/Need to read the quarterly notes.*recoverably delete.*until you revoke it/)).toBeVisible();
	expect(screen.queryByText(/Then combine them/)).toBeNull();
	click("Allow");
	expect(state.confirm).toHaveBeenCalledExactlyOnceWith(
		{ id: "request", deviceId: mac.id, connectorIds: ["local-files", "computer-control"] },
		expect.anything(),
	);
});

test("choosing among several devices only stages consent; the user must still allow the named device", () => {
	state.devices.items.push(pc, { ...mac, id: "offline", name: "Offline Mac", online: false });
	show();
	expect(screen.getByText("Choose a device")).toBeVisible();
	expect(screen.queryByRole("radio", { name: "Offline Mac" })).toBeNull();
	expect(choose("Allow")).toBeNull();
	selectDevice(pc.name);
	expect(state.confirm).not.toHaveBeenCalled();
	expect(screen.getByRole("radio", { name: pc.name })).toBeChecked();
	expect(screen.getByRole("radio", { name: mac.name })).not.toBeChecked();
	expect(screen.getByText("Allow reading files on Studio PC?")).toBeVisible();
	click("Allow");
	expect(state.confirm).toHaveBeenCalledExactlyOnceWith(
		{ id: "request", connectorIds: ["local-files"], deviceId: pc.id },
		expect.anything(),
	);
});

test("a device hint starts with that device; switching does not dispatch a grant", () => {
	state.devices.items.push(pc);
	state.request = view({ deviceHintId: pc.id });
	show();
	expect(screen.getByText("Allow reading files on Studio PC?")).toBeVisible();
	click("Switch device");
	expect(screen.getByRole("radio", { name: pc.name })).toBeChecked();
	expect(screen.getByRole("radio", { name: pc.name })).toHaveFocus();
	selectDevice(mac.name);
	expect(state.confirm).not.toHaveBeenCalled();
	expect(screen.getByText("Allow reading files on MacBook Pro?")).toBeVisible();
});

test("the pending card can be declined without granting anything", () => {
	show();
	click("Don't allow");
	expect(state.cancel).toHaveBeenCalledExactlyOnceWith("request");
	expect(state.confirm).not.toHaveBeenCalled();
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
	expect(choose("Allow")).toBeNull();
	click("Try again");
	expect(state.refetch).toHaveBeenCalledOnce();
	expect(state.confirm).not.toHaveBeenCalled();
});

test("an offline response reloads eligible devices before another consent", () => {
	state.confirm.mockImplementation((_body, options) => {
		options?.onError(new ApiError({ code: "device_offline", status: 409, message: "device_offline" }));
	});
	show();
	click("Allow");
	expect(state.refreshDevices).toHaveBeenCalledOnce();
	expect(choose("Allow")).toBeNull();
	expect(screen.getByRole("radio", { name: mac.name })).toBeVisible();
});

test("dispatched uses an accessible spinner and cannot be allowed again", () => {
	state.request = view({ state: "dispatched", deviceId: mac.id, deviceName: mac.name });
	show();
	expect(screen.getByRole("status", { name: "Waiting for the device" })).toBeVisible();
	expect(screen.getByText("Allow reading files on MacBook Pro?")).toBeVisible();
	expect(choose("Allow")).toBeNull();
	click("Cancel");
	expect(state.cancel).toHaveBeenCalledExactlyOnceWith("request");
});

test.each(["pending", "started", undefined] as const)(
	"a granted permission stays compact (%s continuation)",
	(continuation) => {
		state.request = view({ state: "granted", ...(continuation ? { continuation } : {}) });
		show();
		expect(screen.getByText("Allowed")).toBeVisible();
		expect(screen.queryByRole("button")).toBeNull();
	},
);

test("a recoverable continuation failure continues the task without granting again", () => {
	state.request = view({ state: "granted", continuation: "failed" });
	show();
	expect(screen.getByText("Allowed")).toBeVisible();
	click("Continue task");
	expect(state.resume).toHaveBeenCalledExactlyOnceWith("request");
	expect(state.confirm).not.toHaveBeenCalled();
});

test.each(["expired", "failed"] as const)(
	"%s requests require explicitly allowing the named device again",
	(status) => {
		state.request = view({
			state: status,
			deviceId: mac.id,
			failure: status === "failed" ? "permission_denied" : null,
		});
		show();
		if (status === "failed") expect(screen.getByRole("alert")).toHaveTextContent("permission_denied");
		click("Allow again");
		expect(state.confirm).toHaveBeenCalledExactlyOnceWith(
			{ id: "request", connectorIds: ["local-files"], deviceId: mac.id },
			expect.anything(),
		);
	},
);

test("request_changed refreshes the card instead of reapplying old consent", () => {
	state.confirm.mockImplementation((_body, options) => {
		options?.onError(new ApiError({ code: "request_changed", status: 409, message: "request_changed" }));
	});
	show();
	click("Allow");
	expect(state.refetch).toHaveBeenCalledOnce();
	expect(state.confirm).toHaveBeenCalledOnce();
});

test("cancelled is final", () => {
	state.request = view({ state: "cancelled" });
	show();
	expect(screen.getByText("Cancelled")).toBeVisible();
	expect(screen.queryByRole("button")).toBeNull();
});
