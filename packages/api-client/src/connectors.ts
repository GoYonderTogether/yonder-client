import type {
	Attachment,
	ConnectorCatalogResponse,
	ConnectorCommandResult,
	ConnectorFileDownload,
	ConnectorFilePreviewRequest,
	ConnectorFilePreviewStatus,
	ConnectorFileTextPage,
	ConnectorId,
	ConnectorInstance,
	ConnectorListResponse,
	ConnectorRequestDevicesResponse,
	ConnectorRequestView,
	CreateConnectorRequest,
	UpdateConnectorRequest,
} from "@yonder/protocol";
import { type ApiClient, ApiError, type ApiResponse } from "./client.ts";

export type ConnectorFileContent =
	| ConnectorFilePreviewStatus
	| ConnectorFileTextPage
	| ConnectorFileDownload
	| { kind: "file"; sha256: string; name: string; blob: Blob };

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
		async connectorFilePreview(
			id: string,
			body: ConnectorFilePreviewRequest,
			signal?: AbortSignal,
		): Promise<ConnectorFileContent> {
			const response = await client.request<ApiResponse>(`/v1/connectors/${encodeURIComponent(id)}/file-preview`, {
				body,
				responseType: "response",
				...(signal ? { signal } : {}),
			});
			const sha256 = response.headers?.get("x-yonder-file-sha256");
			if (sha256 === null || sha256 === undefined)
				return (await response.json()) as ConnectorFilePreviewStatus | ConnectorFileTextPage | ConnectorFileDownload;
			const name = /filename\*=UTF-8''([^;]+)/i.exec(response.headers?.get("content-disposition") ?? "")?.[1];
			if (!name || !/^[a-f0-9]{64}$/.test(sha256)) {
				await response.body?.cancel?.();
				throw new ApiError({ code: "upstream_unavailable", status: 502, message: "invalid file response" });
			}
			return { kind: "file", sha256, name: decodeURIComponent(name), blob: await response.blob() };
		},
		acknowledgeConnectorFilePreview(
			id: string,
			receipt: string,
			sha256: string,
			signal?: AbortSignal,
		): Promise<{ ok: true }> {
			return client.request(
				`/v1/connectors/${encodeURIComponent(id)}/file-preview/${encodeURIComponent(receipt)}/ack`,
				{ body: { sha256 }, ...(signal ? { signal } : {}) },
			);
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
