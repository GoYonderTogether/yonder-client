// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Provider } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

const actions = vi.hoisted(() => ({
	save: vi.fn().mockResolvedValue({}),
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
	fireEvent.change(screen.getByLabelText("Request URL"), { target: { value: "https://other.example.org" } });
	expect(screen.getByLabelText("API key")).toHaveValue("");
	expect(screen.getByLabelText("API key")).toHaveAttribute("type", "password");
	expect(screen.getByText("Enter the key again after changing the address or protocol.")).toBeVisible();
	expect(screen.getByRole("button", { name: "Get models" })).toBeDisabled();
});

test("empty name or models cannot be saved with an existing key", () => {
	actions.save.mockClear();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<ProviderEditor provider={provider} onDone={() => {}} />
		</I18nextProvider>,
	);
	const name = screen.getByLabelText("Name");
	fireEvent.change(name, { target: { value: " " } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(screen.getByRole("alert")).toHaveTextContent("Enter a name, a valid URL, a key and at least one model.");
	fireEvent.change(name, { target: { value: "Provider" } });
	fireEvent.change(screen.getByLabelText("Models (comma-separated)"), { target: { value: " , " } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(screen.getByRole("alert")).toHaveTextContent("Enter a name, a valid URL, a key and at least one model.");
	expect(actions.save).not.toHaveBeenCalled();
});
