import { fireEvent, render, screen } from "@testing-library/react";
import type { ConnectorDefinition, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { beforeEach, vi } from "vitest";
import { ConnectorsSection } from "./connectors-section.tsx";
import type { LocalFilesAdapter } from "./local-files-adapter.ts";

const state = vi.hoisted(() => ({
	devices: [] as DeviceSummary[],
	instances: [] as ConnectorInstance[],
	catalog: [] as ConnectorDefinition[],
	create: vi.fn(),
	update: vi.fn(),
	remove: vi.fn(),
	refetch: vi.fn(),
}));
vi.mock("@yonder/ui-data", () => ({
	useConnectorCatalog: () => ({
		data: {
			items:
				state.catalog.length > 0
					? state.catalog
					: ["local-files", "computer-control"].map((id) => ({
							id,
							name: id,
							description: id,
							kind: "device",
							platforms: ["windows"],
						})),
		},
	}),
	useConnectors: () => ({ data: { items: state.instances }, refetch: state.refetch }),
	useDevices: () => ({ data: { items: state.devices }, refetch: state.refetch }),
	useConnectorActions: () => ({
		create: { mutateAsync: state.create },
		update: { mutateAsync: state.update },
		remove: { mutateAsync: state.remove },
	}),
}));
vi.mock("@yonder/ui-shell", async (original) => ({
	...(await original<object>()),
	useShellChrome: () => ({ mode: "wide" }),
}));
const base: ConnectorInstance = {
	id: "con_a",
	connectorId: "local-files",
	deviceId: "dev_a",
	deviceName: "Windows PC",
	name: "Windows PC",
	scope: "device",
	capabilities: { fileTools: false, terminal: false, desktop: false, browser: false },
	revision: 1,
	status: "online",
	currentDevice: true,
	createdAt: "2026-11-15T00:00:00Z",
};
const both: ConnectorInstance[] = [
	base,
	{
		...base,
		id: "con_b",
		connectorId: "computer-control",
		capabilities: { fileTools: true, terminal: false, desktop: false, browser: false },
	},
];
const firstDevice: DeviceSummary = {
	id: "dev_a",
	name: "Windows PC",
	platform: "windows",
	current: true,
	status: "online",
	lastSeenAt: "2026-11-16T00:00:00Z",
	appVersion: "1",
};
function adapter(): LocalFilesAdapter {
	return {
		supported: true,
		authorize: vi.fn().mockResolvedValue(undefined),
		revoke: vi.fn().mockResolvedValue(undefined),
	};
}
function show(localFiles?: LocalFilesAdapter, onTryConnector?: (draft: string) => void) {
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<ConnectorsSection localFiles={localFiles} onTryConnector={onTryConnector} />
		</I18nextProvider>,
	);
}
function openCard(name: string) {
	fireEvent.click(screen.getAllByRole("button", { name })[0] as HTMLElement);
	return screen.getByRole("dialog", { name: "Computer access" });
}
beforeEach(() => {
	state.devices = [{ ...firstDevice }];
	state.instances = [];
	state.catalog = [];
	state.create.mockReset().mockImplementation(async (body) => ({ ...base, ...body }));
	state.update.mockReset();
	state.remove.mockReset().mockResolvedValue({ ok: true });
	state.refetch.mockReset();
});

export { adapter, base, both, firstDevice, openCard, show, state };
