import type { BrandId, ConnectorDefinition, ConnectorId, ConnectorInstance, DeviceSummary } from "@yonder/protocol";

/**
 * A catalog entry or one of the `computer-control` capability members (terminal, desktop control).
 * Those two are capabilities rather than connectors of their own, so their ids have no catalog entry
 * and no grant of their own.
 */
export interface MemberDefinition {
	id: ConnectorId | "computer-control:terminal" | "computer-control:desktop";
	kind: ConnectorDefinition["kind"];
	name: string;
	description: string;
	platforms: DeviceSummary["platform"][];
	/** The brand whose own app this connector reads, when it declares one (04 图标登记表). */
	brand?: BrandId;
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
	// The capability members are only offered where the native side exists; their platform list
	// already says so, and they have no connector id to ask the adapter about.
	const supported =
		id === "computer-control:terminal" || id === "computer-control:desktop"
			? adapter?.supported === true
			: (adapter?.supports?.(id) ?? (!id.startsWith("apple-") && adapter?.supported === true));
	return device.current && definition.platforms.includes(device.platform) && supported;
}
