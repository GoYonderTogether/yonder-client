// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DeviceSummary, Provider } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

const actions = vi.hoisted(() => ({
	save: vi.fn().mockResolvedValue({}),
	readDeviceEndpoints: vi.fn().mockResolvedValue({ items: [] }),
	discoverModels: vi.fn().mockResolvedValue({ models: ["m1", "m2"] }),
}));
vi.mock("@yonder/ui-data", () => ({
	useProviderActions: () => actions,
	useDevices: () => ({ data: { items: [] }, isLoading: false, isError: false }),
}));

import { ProviderEditor } from "./provider-editor.tsx";

const provider: Provider = {
	id: "p1",
	scope: "user",
	name: "Provider",
	baseUrl: "https://example.org",
	protocol: "openai",
	models: ["m1"],
	keyConfigured: true,
	enabled: true,
	isDefault: false,
	origin: "cloud",
};

test("editing never displays a stored key and discovery reuses it only by provider id", async () => {
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<ProviderEditor provider={provider} onDone={() => {}} />
		</I18nextProvider>,
	);
	expect(screen.getByText("API key · Saved")).toBeInTheDocument();
	expect(screen.queryByLabelText("API key")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Get models" }));
	await waitFor(() =>
		expect(actions.discoverModels).toHaveBeenCalledWith({
			baseUrl: "https://example.org",
			protocol: "openai",
			providerId: "p1",
		}),
	);
	expect(await screen.findByRole("checkbox", { name: "m2" })).not.toBeChecked();
	fireEvent.change(screen.getByRole("textbox", { name: "Request URL" }), {
		target: { value: "https://other.example.org" },
	});
	expect(screen.getByLabelText("API key")).toHaveValue("");
	expect(screen.getByLabelText("API key")).toHaveAttribute("type", "password");
	expect(screen.queryByText("Enter the key again after changing the address or protocol.")).toBeNull();
	expect(screen.getByRole("button", { name: "Get models" })).toBeDisabled();
});

test("empty name or models cannot be saved with an existing key", () => {
	actions.save.mockClear();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<ProviderEditor provider={provider} onDone={() => {}} />
		</I18nextProvider>,
	);
	const name = screen.getByRole("textbox", { name: "Name" });
	fireEvent.change(name, { target: { value: " " } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(screen.getByRole("alert")).toHaveTextContent("Enter a name, a valid URL, a key and at least one model.");
	fireEvent.change(name, { target: { value: "Provider" } });
	fireEvent.change(screen.getByRole("textbox", { name: "Models (comma-separated)" }), { target: { value: " , " } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(screen.getByRole("alert")).toHaveTextContent("Enter a name, a valid URL, a key and at least one model.");
	expect(actions.save).not.toHaveBeenCalled();
});

const myDevice: DeviceSummary = {
	id: "desktop-a",
	name: "My Mac",
	platform: "macos",
	appVersion: "1",
	current: true,
	status: "online",
	lastSeenAt: "2026-11-22T10:30:00.000Z",
};
const remote: DeviceSummary = { ...myDevice, id: "desktop-b", name: "Other desktop", current: false };
const nativeEndpoint = {
	deviceId: myDevice.id,
	endpointId: "device-opaque-one",
	revision: 1,
	label: "Local model",
	protocol: "openai" as const,
};
const remoteEndpoint = {
	deviceId: remote.id,
	endpointId: "device-opaque-two",
	revision: 1,
	label: "Office Local",
	protocol: "openai" as const,
};
function startLocal({ native = false }: { native?: boolean } = {}) {
	actions.save.mockClear();
	actions.discoverModels.mockClear();
	actions.readDeviceEndpoints.mockReset().mockResolvedValue({ items: [remoteEndpoint, nativeEndpoint] });
	const invoke = vi.fn().mockResolvedValue(nativeEndpoint);
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<ProviderEditor
				devices={[myDevice, remote]}
				endpoints={[remoteEndpoint]}
				registerEndpoint={native ? invoke : undefined}
				onDone={() => {}}
			/>
		</I18nextProvider>,
	);
	return invoke;
}
function chooseDevice(name: RegExp) {
	fireEvent.click(screen.getByRole("button", { name: /^Run on:/ }));
	fireEvent.click(screen.getByRole("option", { name }));
}
test("cloud cannot send localhost, and native registers a single exact address before device discovery and save", async () => {
	const invoke = startLocal({ native: true });
	const request = screen.getByRole("textbox", { name: "Request URL" });
	fireEvent.change(request, { target: { value: "http://localhost:11434/v1/" } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(screen.getByRole("alert")).toHaveTextContent("Choose a device for localhost.");
	expect(actions.save).not.toHaveBeenCalled();
	expect(invoke).not.toHaveBeenCalled();
	chooseDevice(/My Mac.*Online/);
	expect(screen.getByLabelText("API key")).toHaveValue("");
	expect(screen.getByLabelText("API key")).not.toBeRequired();
	expect(screen.getByRole("textbox", { name: "Request URL" })).toHaveValue("http://localhost:11434/v1/");
	fireEvent.click(screen.getByRole("button", { name: "Get models" }));
	await waitFor(() =>
		expect(actions.discoverModels).toHaveBeenCalledWith({
			origin: "device",
			deviceId: myDevice.id,
			endpointId: nativeEndpoint.endpointId,
			protocol: "openai",
		}),
	);
	expect(invoke).toHaveBeenCalledExactlyOnceWith({
		deviceId: myDevice.id,
		baseUrl: "http://localhost:11434/v1",
		label: "Local model",
		protocol: "openai",
	});
	fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Local" } });
	fireEvent.change(screen.getByRole("textbox", { name: "Models (comma-separated)" }), { target: { value: "m1" } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() =>
		expect(actions.save).toHaveBeenCalledWith(undefined, {
			name: "Local",
			note: null,
			website: null,
			models: ["m1"],
			protocol: "openai",
			origin: "device",
			deviceId: myDevice.id,
			endpointId: nativeEndpoint.endpointId,
		}),
	);
	expect(invoke).toHaveBeenCalledTimes(1);
});
test("Web shows only advertised exact endpoints and never accepts an address or key for a remote desktop", async () => {
	const invoke = startLocal();
	chooseDevice(/Other desktop.*Online/);
	expect(screen.queryByRole("option", { name: /My Mac/ })).toBeNull();
	expect(screen.queryByRole("textbox", { name: "Request URL" })).toBeNull();
	expect(screen.queryByLabelText("API key")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: /Request URL:/ }));
	fireEvent.click(screen.getByRole("option", { name: "Office Local" }));
	fireEvent.click(screen.getByRole("button", { name: "Get models" }));
	await waitFor(() =>
		expect(actions.discoverModels).toHaveBeenCalledWith({
			origin: "device",
			deviceId: remote.id,
			endpointId: remoteEndpoint.endpointId,
			protocol: "openai",
		}),
	);
	expect(invoke).not.toHaveBeenCalled();
	expect(actions.readDeviceEndpoints).not.toHaveBeenCalled();
});

test("a local key is discarded when switching to a different address or to Cloud", () => {
	const invoke = startLocal({ native: true });
	chooseDevice(/My Mac.*Online/);
	fireEvent.change(screen.getByRole("textbox", { name: "Request URL" }), {
		target: { value: "http://localhost:8788/v1" },
	});
	fireEvent.change(screen.getByLabelText("API key"), { target: { value: "synthetic-a" } });
	fireEvent.change(screen.getByRole("textbox", { name: "Request URL" }), {
		target: { value: "http://localhost:11434/v1" },
	});
	expect(screen.getByLabelText("API key")).toHaveValue("");
	fireEvent.change(screen.getByLabelText("API key"), { target: { value: "synthetic-b" } });
	chooseDevice(/^Cloud$/);
	expect(screen.getByLabelText("API key")).toHaveValue("");
	expect(invoke).not.toHaveBeenCalled();
	expect(actions.discoverModels).not.toHaveBeenCalled();
});
