// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";
import { pendingConnectorRequest } from "../lib/connector-request.ts";

const mock = vi.hoisted(() => ({
	read: vi.fn().mockResolvedValue({
		id: "request",
		connectorId: "local-files",
		state: "pending",
		originalPrompt: "Read my files",
	}),
	confirm: vi.fn().mockResolvedValue({
		id: "request",
		connectorId: "local-files",
		state: "approved",
		originalPrompt: "Read my files",
	}),
	cancel: vi.fn(),
	navigate: vi.fn(),
}));
vi.mock("@yonder/ui-data", () => ({
	useApi: () => ({
		connectorRequest: mock.read,
		confirmConnectorRequest: mock.confirm,
		cancelConnectorRequest: mock.cancel,
	}),
	usePerson: () => ({ id: "owner" }),
}));
vi.mock("react-router", () => ({ useNavigate: () => mock.navigate }));

import { ConnectorRequestCard } from "./connector-request-card.tsx";

afterEach(() => {
	sessionStorage.clear();
	vi.clearAllMocks();
});
test("the card never confirms or authorizes before the owner clicks", async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<I18nextProvider i18n={createI18n("en")}>
				<ConnectorRequestCard id="request" ready />
			</I18nextProvider>
		</QueryClientProvider>,
	);
	expect(await screen.findByText("Read my files")).toBeVisible();
	expect(mock.confirm).not.toHaveBeenCalled();
	expect(pendingConnectorRequest()).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Confirm and authorize" }));
	await waitFor(() => expect(mock.confirm).toHaveBeenCalledWith("request"));
	await waitFor(() => expect(mock.navigate).toHaveBeenCalledWith("/me/connectors"));
	expect(pendingConnectorRequest()).toEqual({ id: "request", connectorId: "local-files", ownerId: "owner" });
});
