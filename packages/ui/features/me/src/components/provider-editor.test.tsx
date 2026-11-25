// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DeviceSummary, Provider } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

const actions = vi.hoisted(() => ({
	save: vi.fn().mockResolvedValue({}),
	readDevices: vi.fn().mockResolvedValue({ items: [] }),
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
	origin: "cloud",
	name: "Provider",
	baseUrl: "https://example.org",
	protocol: "openai-chat",
	models: ["m1"],
	keyConfigured: true,
	enabled: true,
	isDefault: false,
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
			protocol: "openai-chat",
			providerId: "p1",
		}),
	);
	// A discovered model becomes its own row, named by the id it was discovered under.
	expect(await screen.findAllByDisplayValue("m2")).toHaveLength(1);
	fireEvent.change(screen.getByRole("textbox", { name: "Request URL" }), {
		target: { value: "https://other.example.org" },
	});
	// Changing the address makes the stored key unusable, so the form asks for it again.
	const key = screen.getByLabelText("API key");
	expect(key).toHaveValue("");
	expect(key).toHaveAttribute("type", "password");
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
	// Blanking the only row's request model leaves nothing to save.
	fireEvent.change(screen.getByRole("textbox", { name: "Request model" }), { target: { value: " " } });
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
const nativeEndpoint = { endpointId: "device-opaque-one", revision: 1, label: "Local model" };
const remoteEndpoint = {
	endpointId: "device-opaque-two",
	revision: 1,
	label: "Office Local",
	protocol: "openai",
} as const;
const advertised = (endpoint = nativeEndpoint) => ({
	...myDevice,
	modelEndpoints: [{ protocol: "openai" as const, ...endpoint }],
});
function startLocal({ native = false }: { native?: boolean } = {}) {
	actions.save.mockClear();
	actions.discoverModels.mockClear();
	actions.readDevices
		.mockReset()
		.mockResolvedValue({ items: [advertised(), { ...remote, modelEndpoints: [remoteEndpoint] }] });
	const invoke = vi.fn().mockResolvedValue(nativeEndpoint);
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<ProviderEditor
				devices={[myDevice, { ...remote, modelEndpoints: [remoteEndpoint] }]}
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
			protocol: "openai-chat",
			origin: "device",
			deviceId: myDevice.id,
			endpointId: nativeEndpoint.endpointId,
		}),
	);
	// The native registration speaks the device wire's own names, not the upstream's four.
	expect(invoke).toHaveBeenCalledExactlyOnceWith({
		deviceId: myDevice.id,
		baseUrl: "http://localhost:11434/v1",
		label: "Local model",
		protocol: "openai",
	});
	fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Local" } });
	// Discovery added a row; the first one is the one this test fills.
	fireEvent.change(screen.getAllByRole("textbox", { name: "Request model" })[0] as HTMLElement, {
		target: { value: "m1" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() =>
		expect(actions.save).toHaveBeenCalledWith(undefined, {
			name: "Local",
			note: null,
			models: ["m1", "m2"],
			metadata: { m1: {}, m2: {} },
			protocol: "openai-chat",
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
			protocol: "openai-chat",
			origin: "device",
			deviceId: remote.id,
			endpointId: remoteEndpoint.endpointId,
		}),
	);
	expect(invoke).not.toHaveBeenCalled();
	expect(actions.readDevices).not.toHaveBeenCalled();
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

test("changing protocol at the same local URL requires a separately approved endpoint", async () => {
	const invoke = startLocal({ native: true });
	const anthropic = { ...nativeEndpoint, endpointId: "anthropic-opaque", protocol: "anthropic" } as const;
	invoke.mockResolvedValueOnce(nativeEndpoint).mockResolvedValueOnce(anthropic);
	actions.readDevices.mockResolvedValue({
		items: [{ ...myDevice, modelEndpoints: [advertised().modelEndpoints[0], anthropic] }],
	});
	chooseDevice(/My Mac.*Online/);
	fireEvent.change(screen.getByRole("textbox", { name: "Request URL" }), {
		target: { value: "http://127.0.0.1:8788/v1" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Get models" }));
	await waitFor(() => expect(actions.discoverModels).toHaveBeenCalledTimes(1));

	fireEvent.change(screen.getByLabelText("API key"), { target: { value: "synthetic-old-protocol-key" } });
	fireEvent.click(screen.getByRole("button", { name: /^Protocol:/ }));
	fireEvent.click(screen.getByRole("option", { name: "Anthropic Messages" }));
	expect(screen.getByLabelText("API key")).toHaveValue("");
	fireEvent.click(screen.getByRole("button", { name: "Get models" }));
	await waitFor(() =>
		expect(actions.discoverModels).toHaveBeenLastCalledWith({
			protocol: "anthropic-messages",
			origin: "device",
			deviceId: myDevice.id,
			endpointId: anthropic.endpointId,
		}),
	);
	expect(invoke).toHaveBeenCalledTimes(2);
	// The native registration speaks the device wire's name for the same wire.
	expect(invoke).toHaveBeenLastCalledWith({
		deviceId: myDevice.id,
		baseUrl: "http://127.0.0.1:8788/v1",
		label: "Local model",
		protocol: "anthropic",
	});
});

test("Add Provider reports current asynchronous failures, not validation or successful API responses", async () => {
	const onAddFailure = vi.fn();
	const onDone = vi.fn();
	const rejected = new Error("test rejection");
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<ProviderEditor
				preset={{ id: "custom", name: "Provider", baseUrl: "https://example.org", models: "m1", keyUrl: null }}
				onAddFailure={onAddFailure}
				onDone={onDone}
			/>
		</I18nextProvider>,
	);
	const save = screen.getByRole("button", { name: "Save" });
	fireEvent.click(save);
	expect(onAddFailure).not.toHaveBeenCalled();

	fireEvent.change(screen.getByLabelText("API key"), { target: { value: "fixture" } });
	const discover = screen.getByRole("button", { name: "Get models" });
	actions.discoverModels.mockResolvedValueOnce({ models: [] });
	fireEvent.click(discover);
	await screen.findByRole("alert");
	expect(onAddFailure).not.toHaveBeenCalled();

	actions.discoverModels.mockRejectedValueOnce(rejected);
	fireEvent.click(discover);
	await waitFor(() => expect(onAddFailure).toHaveBeenCalledExactlyOnceWith("discover", rejected, expect.any(Number)));

	actions.save.mockRejectedValueOnce(rejected);
	fireEvent.click(save);
	await waitFor(() => expect(onAddFailure).toHaveBeenCalledWith("save", rejected, expect.any(Number)));
	expect(onAddFailure).toHaveBeenCalledTimes(2);
	actions.save.mockResolvedValueOnce({});
	fireEvent.click(save);
	await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
	expect(onAddFailure).toHaveBeenCalledTimes(2);
});
