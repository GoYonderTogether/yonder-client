// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ConnectorRequestView } from "@yonder/protocol";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { keys } from "../query/keys.ts";
import { applyServerEvent } from "../realtime/events.ts";
import { useConnectorRequestActions } from "./connector-requests.ts";

const api = vi.hoisted(() => ({ continueConnectorRequest: vi.fn() }));
vi.mock("../query/provider.tsx", () => ({ useApi: () => api }));

test("a late continue response cannot replace the started state from the socket", async () => {
	const request: ConnectorRequestView = {
		id: "request",
		connectorIds: ["local-files"],
		reason: "Read a file",
		state: "granted",
		deviceId: "device",
		deviceName: "Desktop",
		connectionIds: ["local"],
		failure: null,
		continuation: "failed",
	};
	const client = new QueryClient();
	const key = keys.connectorRequest(request.id);
	client.setQueryData(key, request);
	let finish: () => void = () => {};
	api.continueConnectorRequest.mockReturnValueOnce(
		new Promise<ConnectorRequestView>((resolve) => {
			finish = () => resolve({ ...request, continuation: "pending" });
		}),
	);
	const { result, unmount } = renderHook(() => useConnectorRequestActions(), {
		wrapper: ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		),
	});
	const completion = result.current.resume.mutateAsync(request.id);
	await waitFor(() => expect(api.continueConnectorRequest).toHaveBeenCalledWith(request.id));
	applyServerEvent(client, {
		type: "connector_request.updated",
		eventId: "started",
		at: "2026-11-20T00:00:00Z",
		request: { ...request, continuation: "started" },
	});
	await act(async () => {
		finish();
		await completion;
	});
	expect(client.getQueryData(key)).toMatchObject({ continuation: "started" });
	unmount();
	client.clear();
});
