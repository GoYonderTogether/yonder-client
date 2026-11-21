import type { ConnectorDefinition, ConnectorId, ConnectorInstance, DeviceSummary } from "@yonder/protocol";

export interface LocalFilesAdapter {
	supported: boolean;
	/** OS availability. A denied native permission is still a supported connector. */
	supports?(connectorId: ConnectorId): boolean;
	prepare?(connectorId: ConnectorId): Promise<void>;
	openPermissionSettings?(connectorId: ConnectorId): Promise<void>;
	authorize(
		connection: Pick<ConnectorInstance, "id" | "connectorId" | "scope" | "capabilities" | "revision">,
	): Promise<void>;
	revoke(connectionId: string, connectorId?: ConnectorId): Promise<void>;
}

export function canConfigureConnector(
	device: DeviceSummary,
	definition: ConnectorDefinition,
	adapter?: LocalFilesAdapter,
): boolean {
	return (
		device.current &&
		definition.platforms.includes(device.platform) &&
		(adapter?.supports?.(definition.id) ?? (!definition.id.startsWith("apple-") && adapter?.supported === true))
	);
}
