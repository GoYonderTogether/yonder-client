import type { ConnectorDefinition, ConnectorId, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { BROWSER_MEMBER, type MemberDefinition } from "./local-files-adapter.ts";

/**
 * The catalog's own connectors. `ConnectorId` also admits a Bot-written `custom:<slug>`, which has no
 * catalog entry and no icon in this registry (04 gives those their own brand registry); a map keyed
 * by the catalog's ids is deliberately narrower than the whole union.
 */
export type CatalogConnectorId = Exclude<ConnectorId, `custom:${string}`>;

/** One card on the page: a connector, or catalog entries the owner sees as one connector. */
export interface ConnectorGroup {
	id: "computer" | ConnectorId;
	/** Entries in the order their switches are drawn, the terminal included where it applies. */
	members: readonly MemberDefinition[];
}

/**
 * Entries drawn as one computer card; the catalog and the grants stay one row per entry.
 *
 * `terminal` and `desktop` are not catalog entries: they are capabilities of `computer-control`, so
 * they are shown as removable members of the computer card. Each appears only on a macOS or Windows
 * desktop, because the native runner/backend that executes them ships in those builds and nowhere
 * else.
 */
const COMPUTER: readonly CatalogConnectorId[] = ["local-files", "computer-control"];

/** The terminal member's id inside the computer card. It names no catalog connector or grant. */
export const TERMINAL_MEMBER = "computer-control:terminal";
/** The desktop-control member's id inside the computer card. It names no catalog connector or grant. */
export const DESKTOP_MEMBER = "computer-control:desktop";
/**
 * A member definition as the switches handle it: `ConnectorDefinition` plus the capability members,
 * whose ids are not one of the catalog's `ConnectorId`s.
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

/**
 * The desktop-control member, built for one device's platform. `null` where it does not apply — only
 * macOS and Windows have a desktop backend. Like the terminal, the catalog never lists it.
 */
export function desktopMember(platform: DeviceSummary["platform"]): MemberDefinition | null {
	if (platform !== "macos" && platform !== "windows") return null;
	return {
		id: DESKTOP_MEMBER,
		kind: "device",
		name: "desktop",
		description: "desktop",
		platforms: ["macos", "windows"],
	};
}

/**
 * Browser control as a member definition. Like the terminal it is a capability of
 * `computer-control`, not a catalog entry. It appears only on a macOS or Windows desktop, because
 * that is where `bsk` ships (specs/connectors/browser.md §2).
 */
export function browserMember(platform: DeviceSummary["platform"]): MemberDefinition | null {
	if (platform !== "macos" && platform !== "windows") return null;
	return {
		id: BROWSER_MEMBER,
		kind: "device",
		name: "browser",
		description: "browser",
		platforms: ["macos", "windows"],
	};
}

export function groupConnectors(
	definitions: readonly ConnectorDefinition[],
	platform?: DeviceSummary["platform"],
): ConnectorGroup[] {
	const computer: MemberDefinition[] = COMPUTER.flatMap((id) => definitions.filter((item) => item.id === id));
	if (computer.length && platform) {
		const browser = browserMember(platform);
		if (browser) computer.push(browser);
	}
	const terminal = platform ? terminalMember(platform) : null;
	if (terminal && computer.length) computer.push(terminal);
	const desktop = platform ? desktopMember(platform) : null;
	if (desktop && computer.length) computer.push(desktop);
	const groups: ConnectorGroup[] = [];
	for (const definition of definitions) {
		// `COMPUTER.includes` is typed to the catalog ids, so the wider id is narrowed once here.
		if (!COMPUTER.includes(definition.id as CatalogConnectorId))
			groups.push({ id: definition.id, members: [definition] });
		else if (!groups.some((group) => group.id === "computer")) groups.push({ id: "computer", members: computer });
	}
	return groups;
}

/** The key a group's copy lives under in `connectors.<key>`; the computer card has its own copy. */
const COPY_KEYS: Record<CatalogConnectorId, string> = {
	"local-files": "localFiles",
	"computer-control": "computerControl",
	"apple-calendar": "appleCalendar",
	"apple-photos": "applePhotos",
	"apple-notes": "appleNotes",
	"apple-voice-memos": "appleVoiceMemos",
};

export function groupKey(group: ConnectorGroup): string {
	if (group.id === "computer") return "computerAccess";
	// A custom connector's copy is its own manifest's name, not this table; the card falls back to it.
	return COPY_KEYS[group.id as CatalogConnectorId] ?? "custom";
}

export type SwitchState = "on" | "off" | "mixed";

/**
 * The master switch of one device: every member granted, none, or some of them.
 *
 * The terminal, desktop control and browser control are left out on purpose. Each is the kind of
 * capability whose card says what it allows — "run any command", "see the screen and operate the
 * mouse and keyboard", "open pages, click and type in your browser" — so it can only be granted by
 * its own switch: a master switch that swept it in would grant it without the row that explains it
 * being read.
 */
export function masterState(
	members: readonly MemberDefinition[],
	instances: readonly ConnectorInstance[],
): SwitchState {
	const covered = members.filter(
		(member) => member.id !== TERMINAL_MEMBER && member.id !== DESKTOP_MEMBER && member.id !== BROWSER_MEMBER,
	);
	const granted = covered.filter((member) =>
		instances.some((item) => item.connectorId === member.id && item.scope === "device"),
	);
	if (!granted.length) return "off";
	return granted.length === covered.length ? "on" : "mixed";
}
