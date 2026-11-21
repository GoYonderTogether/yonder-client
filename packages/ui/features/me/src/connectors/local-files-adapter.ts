import type { ConnectorId, ConnectorInstance } from "@yonder/protocol";

export interface LocalFilesAdapter {
	supported: boolean;
	/** OS availability. A denied native permission is still a supported connector. */
	supports?(connectorId: ConnectorId): boolean;
	prepare?(connectorId: ConnectorId): Promise<void>;
	authorize(
		connection: Pick<ConnectorInstance, "id" | "connectorId" | "scope" | "capabilities" | "revision">,
	): Promise<void>;
	revoke(connectionId: string, connectorId?: ConnectorId): Promise<void>;
}
