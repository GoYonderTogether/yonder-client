import type { ConnectorDefinition } from "@yonder/protocol";
import { useConnectorCatalog, useConnectors, useDevices } from "@yonder/ui-data";
import { useState } from "react";
import { ComputerAccessCard, ComputerAccessPanel, isFileConnector } from "./computer-access.tsx";
import { ConnectorCard } from "./connector-card.tsx";
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
	const [computerOpen, setComputerOpen] = useState(false);
	const [selected, setSelected] = useState<{ definition: ConnectorDefinition; instanceId?: string } | null>(null);
	if (!device || definitions.length === 0) return null;
	const instance = instances.find((item) => item.id === selected?.instanceId);
	return (
		<>
			<div className="flex w-full flex-col gap-[var(--spacing-3)]">
				{definitions.some(isFileConnector) ? (
					<ComputerAccessCard
						instances={instances.filter((item) =>
							definitions.some((def) => isFileConnector(def) && def.id === item.connectorId),
						)}
						onOpen={() => setComputerOpen(true)}
						onLegacy={(item) => {
							const definition = definitions.find((def) => def.id === item.connectorId);
							if (definition) setSelected({ definition, instanceId: item.id });
						}}
					/>
				) : null}
				{definitions
					.filter((definition) => !isFileConnector(definition))
					.map((definition) => (
						<ConnectorCard
							key={definition.id}
							definition={definition}
							device={device}
							instances={instances}
							canConfigure={canConfigureConnector(device, definition, localFiles)}
							onOpen={(chosen, instanceId) =>
								setSelected({ definition: chosen, ...(instanceId ? { instanceId } : {}) })
							}
						/>
					))}
			</div>
			{computerOpen ? (
				<ComputerAccessPanel
					device={device}
					definitions={definitions}
					instances={instances}
					localFiles={localFiles}
					onClose={() => setComputerOpen(false)}
				/>
			) : null}
			{selected ? (
				<ConnectorPanel
					key={`${selected.definition.id}:${selected.instanceId ?? "new"}`}
					device={device}
					definition={selected.definition}
					instance={instance}
					localFiles={localFiles}
					onClose={() => setSelected(null)}
				/>
			) : null}
		</>
	);
}
