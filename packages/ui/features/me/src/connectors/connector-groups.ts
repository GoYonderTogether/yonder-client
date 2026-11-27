import type { ConnectorDefinition, ConnectorId, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import type { MemberDefinition } from "./local-files-adapter.ts";

/** One card on the page: a connector, or catalog entries the owner sees as one connector. */
export interface ConnectorGroup {
	id: "computer" | ConnectorId;
	/** Entries in the order their switches are drawn, the terminal included where it applies. */
	members: readonly MemberDefinition[];
}

/**
 * Entries drawn as one computer card; the catalog and the grants stay one row per entry.
 *
 * `terminal` is not a catalog entry: it is a capability of `computer-control`, so it is shown as a
 * removable member of the computer card. It appears only on a macOS or Windows desktop, because the
 * runner that executes commands ships in those builds and nowhere else.
 */
const COMPUTER: readonly ConnectorId[] = ["local-files", "computer-control"];

/** The terminal member's id inside the computer card. It names no catalog connector or grant. */
export const TERMINAL_MEMBER = "computer-control:terminal";
/**
 * A member definition as the switches handle it: `ConnectorDefinition` plus the terminal member,
 * whose id is not one of the catalog's `ConnectorId`s.
 */
export type { MemberDefinition } from "./local-files-adapter.ts";

/**
 * The terminal as a member definition, built for one device's platform. `null` where it does not
 * apply (Linux is wired but not released; a phone has no terminal). The catalog never lists it:
 * adding it to the definitions is this function's job, so no server change is needed.
 */
export function terminalMember(platform: DeviceSummary["platform"]): MemberDefinition | null {
	if (platform !== "macos" && platform !== "windows") return null;
	return {
		id: TERMINAL_MEMBER,
		kind: "device",
		name: "terminal",
		description: "terminal",
		platforms: ["macos", "windows"],
	};
}

export function groupConnectors(
	definitions: readonly ConnectorDefinition[],
	platform?: DeviceSummary["platform"],
): ConnectorGroup[] {
	const computer: MemberDefinition[] = COMPUTER.flatMap((id) => definitions.filter((item) => item.id === id));
	const terminal = platform ? terminalMember(platform) : null;
	if (terminal && computer.length) computer.push(terminal);
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

/**
 * The master switch of one device: every member granted, none, or some of them.
 *
 * The terminal is left out on purpose. It is the one capability whose card says "run any command,
 * no confirmation", so it can only be granted by its own switch — a master switch that swept it in
 * would grant it without the row that explains it being read.
 */
export function masterState(
	members: readonly MemberDefinition[],
	instances: readonly ConnectorInstance[],
): SwitchState {
	const covered = members.filter((member) => member.id !== TERMINAL_MEMBER);
	const granted = covered.filter((member) =>
		instances.some((item) => item.connectorId === member.id && item.scope === "device"),
	);
	if (!granted.length) return "off";
	return granted.length === covered.length ? "on" : "mixed";
}
