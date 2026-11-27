import { useConnectorCatalog, useConnectors, useDevices } from "@yonder/ui-data";
import { useState } from "react";
import { ConnectorCard } from "./connector-card.tsx";
import { groupConnectors } from "./connector-groups.ts";
import { ConnectorPanel } from "./connector-panel.tsx";
import { canConfigureConnector, type LocalFilesAdapter } from "./local-files-adapter.ts";

export interface ConnectorSetupProps {
	localFiles?: LocalFilesAdapter | undefined;
}

/**
 * What this device can connect and what it has connected: the catalog filtered to the current
 * device's platform. First-run setup uses it to offer only what is really connectable here; on a
 * device that can connect nothing `definitions` is empty and the caller drops the step.
 */
export function useSetupConnectors(localFiles?: LocalFilesAdapter) {
	const catalog = useConnectorCatalog(true);
	const connections = useConnectors({ apple: true });
	const devices = useDevices();
	const device = devices.data?.items.find((item) => item.current);
	const instances = device ? (connections.data?.items.filter((item) => item.deviceId === device.id) ?? []) : [];
	const definitions = device
		? (catalog.data?.items.filter(
				(item) =>
					item.platforms.includes(device.platform) &&
					(canConfigureConnector(device, item, localFiles) ||
						instances.some((instance) => instance.connectorId === item.id)),
			) ?? [])
		: [];
	return {
		device,
		definitions,
		instances,
		loading: catalog.isLoading || connections.isLoading || devices.isLoading,
	};
}

/** The same cards the connectors page draws, opened in the same panel. */
export function ConnectorSetup({ localFiles }: ConnectorSetupProps) {
	const { device, definitions, instances } = useSetupConnectors(localFiles);
	const [selected, setSelected] = useState<string | null>(null);
	if (!device || definitions.length === 0) return null;
	const groups = groupConnectors(definitions, device.platform);
	const group = groups.find((item) => item.id === selected);
	return (
		<>
			<div className="flex w-full flex-col gap-[var(--spacing-3)]">
				{groups.map((item) => (
					<ConnectorCard
						key={item.id}
						group={item}
						device={device}
						instances={instances}
						onOpen={() => setSelected(item.id)}
					/>
				))}
			</div>
			{group ? (
				<ConnectorPanel
					key={group.id}
					group={group}
					devices={[device]}
					instances={instances}
					localFiles={localFiles}
					onClose={() => setSelected(null)}
				/>
			) : null}
		</>
	);
}
