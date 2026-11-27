import type { ConnectorDefinition, ConnectorId, ConnectorInstance, DeviceSummary } from "@yonder/protocol";

/**
 * A catalog entry or the terminal row. The terminal is `computer-control`'s capability rather than a
 * connector of its own, so its id has no catalog entry and no grant of its own.
 */
export interface MemberDefinition {
	id: ConnectorId | "computer-control:terminal";
	kind: ConnectorDefinition["kind"];
	name: string;
	description: string;
	platforms: DeviceSummary["platform"][];
}

export interface LocalFilesAdapter {
	supported: boolean;
	/** OS availability. A denied native permission is still a supported connector. */
	supports?(connectorId: ConnectorId): boolean;
	permissionStatus?(
		connectorId: ConnectorId,
	): "undetermined" | "granted" | "limited" | "denied" | "restricted" | "unavailable" | "unsupported" | undefined;
	prepare?(connectorId: ConnectorId): Promise<void>;
	openPermissionSettings?(connectorId: ConnectorId): Promise<void>;
	authorize(
		connection: Pick<ConnectorInstance, "id" | "connectorId" | "scope" | "capabilities" | "revision">,
	): Promise<void>;
	revoke(connectionId: string, connectorId?: ConnectorId): Promise<void>;
}

export function canConfigureConnector(
	device: DeviceSummary,
	definition: MemberDefinition,
	adapter?: LocalFilesAdapter,
): boolean {
	const id = definition.id;
	// The terminal is only offered where the runner exists; its platform list already says so, and it
	// has no connector id to ask the adapter about.
	const supported =
		id === "computer-control:terminal"
			? adapter?.supported === true
			: (adapter?.supports?.(id) ?? (!id.startsWith("apple-") && adapter?.supported === true));
	return device.current && definition.platforms.includes(device.platform) && supported;
}
