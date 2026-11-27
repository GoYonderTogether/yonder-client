import type { ConnectorDefinition, ConnectorId, ConnectorInstance } from "@yonder/protocol";

/** One card on the page: a connector, or catalog entries the owner sees as one connector. */
export interface ConnectorGroup {
	id: "computer" | ConnectorId;
	/** Catalog entries in the order their switches are drawn. */
	members: readonly ConnectorDefinition[];
}

/** Entries drawn as one computer card; the catalog and the grants stay one row per entry. */
const COMPUTER: readonly ConnectorId[] = ["local-files", "computer-control"];

export function groupConnectors(definitions: readonly ConnectorDefinition[]): ConnectorGroup[] {
	const computer = COMPUTER.flatMap((id) => definitions.filter((item) => item.id === id));
	const groups: ConnectorGroup[] = [];
	for (const definition of definitions) {
		if (!COMPUTER.includes(definition.id)) groups.push({ id: definition.id, members: [definition] });
		else if (!groups.some((group) => group.id === "computer")) groups.push({ id: "computer", members: computer });
	}
	return groups;
}

/** The key a group's copy lives under in `connectors.<key>`; the computer card has its own copy. */
const COPY_KEYS: Record<ConnectorId, string> = {
	"local-files": "localFiles",
	"computer-control": "computerControl",
	"apple-calendar": "appleCalendar",
	"apple-photos": "applePhotos",
	"apple-notes": "appleNotes",
	"apple-voice-memos": "appleVoiceMemos",
};

export function groupKey(group: ConnectorGroup): string {
	return group.id === "computer" ? "computerAccess" : COPY_KEYS[group.id];
}

export type SwitchState = "on" | "off" | "mixed";

/** The master switch of one device: every member granted, none, or some of them. */
export function masterState(
	members: readonly ConnectorDefinition[],
	instances: readonly ConnectorInstance[],
): SwitchState {
	const granted = members.filter((member) =>
		instances.some((item) => item.connectorId === member.id && item.scope === "device"),
	);
	if (!granted.length) return "off";
	return granted.length === members.length ? "on" : "mixed";
}
