import type {
	ConnectorCatalogResponse,
	ConnectorCommandResult,
	ConnectorInstance,
	ConnectorListResponse,
	CreateConnectorRequest,
	UpdateConnectorRequest,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

/** Connectors and the results a local connector reports back. */
export function connectorEndpoints(client: ApiClient) {
	return {
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
