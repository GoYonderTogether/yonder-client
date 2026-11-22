import type {
	Attachment,
	ConnectorCatalogResponse,
	ConnectorCommandResult,
	ConnectorId,
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
		/**
		 * Any signed-in session may allow it by sending the device and connector IDs that the user confirmed.
		 * The server refuses a missing device or a changed connector set.
		 */
		confirmConnectorRequest(
			id: string,
			body: { deviceId?: string; connectorIds?: ConnectorId[] } = {},
		): Promise<ConnectorRequestView> {
			return client.request(`/v1/connector-requests/${encodeURIComponent(id)}/confirm`, { body });
		},
		cancelConnectorRequest(id: string): Promise<ConnectorRequestView> {
			return client.request(`/v1/connector-requests/${encodeURIComponent(id)}/cancel`, { body: {} });
		},
		continueConnectorRequest(id: string): Promise<ConnectorRequestView> {
			return client.request(`/v1/connector-requests/${encodeURIComponent(id)}/continue`, { method: "POST" });
		},
		/** The target device's session reports a failed local grant; other sessions get 403. */
		failConnectorRequest(id: string, error: string, dispatchSeq?: number): Promise<ConnectorRequestView> {
			return client.request(`/v1/connector-requests/${encodeURIComponent(id)}/fail`, { body: { error, dispatchSeq } });
		},
		connectorRequestDevices(id: string): Promise<ConnectorRequestDevicesResponse> {
			return client.request(`/v1/connector-requests/${encodeURIComponent(id)}/devices`);
		},
		connectorCatalog(apple = false): Promise<ConnectorCatalogResponse> {
			return client.request(apple ? "/v1/connectors/catalog?apple=2" : "/v1/connectors/catalog");
		},
		connectors(apple = false): Promise<ConnectorListResponse> {
			return client.request(apple ? "/v1/connectors?apple=2" : "/v1/connectors");
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
		uploadConnectorAttachment(commandId: string, file: File, signal: AbortSignal): Promise<Attachment> {
			const form = new FormData();
			form.set("file", file);
			return client.request(`/v1/connector-commands/${encodeURIComponent(commandId)}/attachment`, {
				raw: { bytes: form },
				signal,
			});
		},
		transcribeConnectorAudio(commandId: string, file: File, signal: AbortSignal): Promise<{ text: string }> {
			const form = new FormData();
			form.set("file", file);
			return client.request(`/v1/connector-commands/${encodeURIComponent(commandId)}/transcription`, {
				raw: { bytes: form },
				signal,
			});
		},
		submitConnectorResult(commandId: string, body: ConnectorCommandResult): Promise<{ ok: true }> {
			return client.request(`/v1/connector-commands/${encodeURIComponent(commandId)}/result`, { body });
		},
	};
}
