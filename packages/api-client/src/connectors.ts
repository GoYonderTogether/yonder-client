import type {
	ConnectorCatalogResponse,
	ConnectorCommandResult,
	ConnectorInstance,
	ConnectorListResponse,
	CreateConnectorRequest,
	UpdateConnectorRequest,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

export interface ConnectorRequestView {
	id: string;
	connectorId: "local-files" | "computer-control";
	state: "pending" | "approved" | "completed" | "cancelled";
	originalPrompt: string;
}

/** Connectors and the results a local connector reports back. */
export function connectorEndpoints(client: ApiClient) {
	return {
		connectorRequest(id: string): Promise<ConnectorRequestView> {
			return client.request(`/v1/connector-requests/${encodeURIComponent(id)}`);
		},
		confirmConnectorRequest(id: string): Promise<ConnectorRequestView> {
			return client.request(`/v1/connector-requests/${encodeURIComponent(id)}/confirm`, { body: {} });
		},
		cancelConnectorRequest(id: string): Promise<ConnectorRequestView> {
			return client.request(`/v1/connector-requests/${encodeURIComponent(id)}/cancel`, { body: {} });
		},
		completeConnectorRequest(id: string, connectionId: string): Promise<ConnectorRequestView> {
			return client.request(`/v1/connector-requests/${encodeURIComponent(id)}/complete`, { body: { connectionId } });
		},
		connectorCatalog(): Promise<ConnectorCatalogResponse> {
			return client.request("/v1/connectors/catalog");
		},
		connectors(): Promise<ConnectorListResponse> {
			return client.request("/v1/connectors");
		},
		createConnector(body: CreateConnectorRequest): Promise<ConnectorInstance> {
			return client.request("/v1/connectors", { body });
		},
		deleteConnector(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/connectors/${encodeURIComponent(id)}`, { method: "DELETE" });
		},
		updateConnector(id: string, body: UpdateConnectorRequest): Promise<ConnectorInstance> {
			return client.request(`/v1/connectors/${encodeURIComponent(id)}`, { method: "PATCH", body });
		},
		submitConnectorResult(commandId: string, body: ConnectorCommandResult): Promise<{ ok: true }> {
			return client.request(`/v1/connector-commands/${encodeURIComponent(commandId)}/result`, { body });
		},
	};
}
