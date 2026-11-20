import type { ConnectorInstance } from "@yonder/protocol";

export interface LocalFilesAdapter {
	supported: boolean;
	authorize(
		connection: Pick<ConnectorInstance, "id" | "connectorId" | "scope" | "capabilities" | "revision">,
	): Promise<void>;
	revoke(connectionId: string): Promise<void>;
}
