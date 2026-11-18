import type { ConnectorInstance } from "@yonder/protocol";

export interface LocalFilesAdapter {
	supported: boolean;
	requested?: (connectorId: ConnectorInstance["connectorId"]) => boolean;
	authorize(
		connection: Pick<ConnectorInstance, "id" | "connectorId" | "scope" | "capabilities" | "revision">,
		options?: { resumeRequest?: boolean },
	): Promise<void>;
	revoke(connectionId: string): Promise<void>;
}
