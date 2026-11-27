/**
 * The native invoke, the socket and the connection list, as `LocalFilesRuntime` sees them. Both the
 * grant tests and the command tests import this first, so the mocks exist before the runtime loads.
 */
import type { ConnectorInstance, ServerEvent } from "@yonder/protocol";
import { vi } from "vitest";

const context = { ownerId: "mem_a", deviceId: "dev_a", sessionId: "ses_a" };
let onEvent: ((event: ServerEvent) => void) | undefined;
let onStatus: (() => void) | undefined;
let onGrantChange: ((revokedConnectionId?: string) => void) | undefined;
const realtime = {
	status: "open",
	send: vi.fn(() => true),
	subscribe: (listener: () => void) => {
		onStatus = listener;
		return () => {
			onStatus = undefined;
		};
	},
	subscribeEvents: (listener: (event: ServerEvent) => void) => {
		onEvent = listener;
		return () => {
			onEvent = undefined;
		};
	},
};
type Row = Pick<ConnectorInstance, "id" | "deviceId" | "revision"> &
	Partial<Pick<ConnectorInstance, "connectorId" | "scope" | "capabilities">>;
const listeners = new Set<() => void>();
const submit = vi.fn(async () => ({ ok: true }));
const fail = vi.fn(async () => ({ id: "request", state: "failed" }));
const conversations = vi.fn();
const uploadConnectorAttachment = vi.fn();
const transcribeConnectorAudio = vi.fn();

export const setup = {
	context,
	account: { current: context },
	/**
	 * The connection list as the query cache holds it. `set` stands in for a `connectors.changed`
	 * refresh landing in the middle of whatever the runtime is doing.
	 */
	connections: {
		snapshot: { items: [{ id: "con_a", deviceId: "dev_a", revision: 2 } as Row] },
		set(items: Row[]) {
			setup.connections.snapshot = { items };
			for (const listener of listeners) listener();
		},
	},
	subscribeConnections(listener: () => void) {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
	resetConnections() {
		setup.connections.snapshot = { items: [{ id: "con_a", deviceId: "dev_a", revision: 2 }] };
		listeners.clear();
	},
	status(next: string) {
		realtime.status = next;
		onStatus?.();
	},
	query: { getQueryData: vi.fn() },
	beginTrayWork: vi.fn(() => ({ attribute: vi.fn(), finish: vi.fn(), update: vi.fn() })),
	conversations,
	realtime,
	/** The provider memoizes the endpoint group; this stands in for that stable object. */
	data: {
		api: {
			submitConnectorResult: submit,
			failConnectorRequest: fail,
			conversations,
			uploadConnectorAttachment,
			transcribeConnectorAudio,
		},
		realtime,
	},
	submit,
	fail,
	invoke: vi.fn(),
	readyApple: vi.fn(),
	executeApple: vi.fn(),
	executeAppleFile: vi.fn(),
	cancelApple: vi.fn(async () => undefined),
	executeShell: vi.fn(),
	cancelShell: vi.fn(async () => undefined),
	/** Set by a test to deliver a native `shell-job-finished` payload. */
	shellFinished: undefined as ((job: unknown) => void) | undefined,
	listenShellJobFinished: vi.fn(async (listener: (event: unknown) => void) => {
		// The real wrapper adds the event's `type`; the mock does the same so the test sees the wire shape.
		setup.shellFinished = (job) => listener({ type: "shell.job.finished", ...(job as object) });
		return () => {
			setup.shellFinished = undefined;
		};
	}),
	event: (event: ServerEvent) => onEvent?.(event),
	revoke: (id: string) => onGrantChange?.(id),
};

vi.mock("@yonder/ui-data", async () => {
	const { useSyncExternalStore } = await import("react");
	return {
		keys: { conversations: { list: () => ["conversations"] } },
		useDataQueryClient: () => setup.query,
		useConnectors: () => ({
			data: useSyncExternalStore(setup.subscribeConnections, () => setup.connections.snapshot),
		}),
		useData: () => setup.data,
	};
});
vi.mock("./local-files.ts", () => ({
	activateAppleConnectors: async () => undefined,
	isAppleConnector: (id: string | undefined) => id?.startsWith("apple-") === true,
	invokeLocalFiles: setup.invoke,
	onLocalFilesChanged: (listener: (revokedConnectionId?: string) => void) => {
		onGrantChange = listener;
		return () => {
			onGrantChange = undefined;
		};
	},
	resetAppleConnectors: async () => undefined,
	useLocalFilesContext: () => setup.account.current,
}));
vi.mock("./apple-resources.ts", () => ({
	readyAppleResourceGrants: setup.readyApple,
	executeAppleResource: setup.executeApple,
	executeAppleResourceFile: setup.executeAppleFile,
	cancelAppleResource: setup.cancelApple,
}));
vi.mock("./tray-bridge.ts", () => ({ beginTrayConnectorWork: setup.beginTrayWork }));
vi.mock("./terminal.ts", () => ({
	executeShell: setup.executeShell,
	cancelShell: setup.cancelShell,
	listenShellJobFinished: setup.listenShellJobFinished,
}));

/** A `connector.grant.request` item; the server sends `local-files` without file tools. */
export const grant = (
	overrides: Partial<{
		connectionId: string;
		connectorId: "local-files" | "computer-control";
		capabilities: { fileTools: boolean; terminal: boolean };
		revision: number;
	}> = {},
) => ({
	connectionId: "con_a",
	connectorId: "local-files" as const,
	scope: "device" as const,
	capabilities: { fileTools: false, terminal: false },
	revision: 2,
	...overrides,
});
