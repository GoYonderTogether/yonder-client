import type { BrandId, ConnectorDefinition, ConnectorId, ConnectorInstance, DeviceSummary } from "@yonder/protocol";

/** The browser-control member's id inside the computer card; not a catalog connector or a grant id. */
export const BROWSER_MEMBER = "computer-control:browser";

/**
 * A catalog entry or one of the `computer-control` capability members (terminal, desktop
 * control, browser control). Those three are capabilities rather than connectors of their own, so
 * their ids have no catalog entry and no grant of their own.
 */
export interface MemberDefinition {
	id: ConnectorId | "computer-control:terminal" | "computer-control:desktop" | typeof BROWSER_MEMBER;
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
	/**
	 * BrowserSkill's own state on this device, read from `bsk` (specs/connectors/browser.md §2): whether
	 * it is installed, its daemon is up, and an extension is attached. `install` is present only where
	 * the platform has an installer and bsk is missing; the switch row offers that one button.
	 */
	browserStatus?(): Promise<BrowserStatus>;
	/** Run the platform's install script for browser control, once per tap. */
	installBrowser?(): Promise<void>;
}

/** The four states the connector page renders for browser control, plus the install entry. */
export interface BrowserStatus {
	installed: boolean;
	daemonRunning: boolean;
	connected: boolean;
	/** The device's own next step for the owner, in one line (Chinese, as the server shows it). */
	hint: string;
	/** Present where the platform has an installer and bsk is missing. */
	install?: { program: string; args: string[] } | null;
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
		id === "computer-control:terminal" || id === "computer-control:desktop" || id === BROWSER_MEMBER
			? adapter?.supported === true
			: (adapter?.supports?.(id) ?? (!id.startsWith("apple-") && adapter?.supported === true));
	return device.current && definition.platforms.includes(device.platform) && supported;
}
