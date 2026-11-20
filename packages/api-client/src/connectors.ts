import type {
	ConnectorCatalogResponse,
	ConnectorCommandResult,
	ConnectorInstance,
	ConnectorListResponse,
	ConnectorRequestDevicesResponse,
	ConnectorRequestView,
	CreateConnectorRequest,
	UpdateConnectorRequest,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

/** Connectors and the results a local connector reports back. */
export function connectorEndpoints(client: ApiClient) {
	return {
		connectorRequest(id: string): Promise<ConnectorRequestView> {
			return client.request(`/v1/connector-requests/${encodeURIComponent(id)}`);
		},
		/** Any signed-in session may allow it; without a device the server picks one or answers 409. */
		confirmConnectorRequest(id: string, body: { deviceId?: string } = {}): Promise<ConnectorRequestView> {
			return client.request(`/v1/connector-requests/${encodeURIComponent(id)}/confirm`, { body });
		},
		cancelConnectorRequest(id: string): Promise<ConnectorRequestView> {
			return client.request(`/v1/connector-requests/${encodeURIComponent(id)}/cancel`, { body: {} });
		},
		/** The target device's session reports a failed local grant; other sessions get 403. */
		failConnectorRequest(id: string, error: string): Promise<ConnectorRequestView> {
			return client.request(`/v1/connector-requests/${encodeURIComponent(id)}/fail`, { body: { error } });
		},
		connectorRequestDevices(id: string): Promise<ConnectorRequestDevicesResponse> {
			return client.request(`/v1/connector-requests/${encodeURIComponent(id)}/devices`);
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
