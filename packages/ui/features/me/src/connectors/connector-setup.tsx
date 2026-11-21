import type { ConnectorDefinition } from "@yonder/protocol";
import { useConnectorCatalog, useConnectors, useDevices } from "@yonder/ui-data";
import { useState } from "react";
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
export function useSetupConnectors() {
	const catalog = useConnectorCatalog();
	const connections = useConnectors();
	const devices = useDevices();
	const device = devices.data?.items.find((item) => item.current);
	const definitions = device
		? (catalog.data?.items.filter((item) => item.platforms.includes(device.platform)) ?? [])
		: [];
	const instances = device ? (connections.data?.items.filter((item) => item.deviceId === device.id) ?? []) : [];
	return {
		device,
		definitions,
		instances,
		loading: catalog.isLoading || connections.isLoading || devices.isLoading,
	};
}

/** The same cards the connectors page draws, opened in the same panel. */
export function ConnectorSetup({ localFiles }: ConnectorSetupProps) {
	const { device, definitions, instances } = useSetupConnectors();
	const [selected, setSelected] = useState<{ definition: ConnectorDefinition; instanceId?: string } | null>(null);
	if (!device || definitions.length === 0) return null;
	const instance = instances.find((item) => item.id === selected?.instanceId);
	return (
		<>
			<div className="flex w-full flex-col gap-[var(--spacing-3)]">
				{definitions.map((definition) => (
					<ConnectorCard
						key={definition.id}
						definition={definition}
						device={device}
						instances={instances}
						canConfigure={canConfigureConnector(device, definition, localFiles)}
						onOpen={(chosen, instanceId) => setSelected({ definition: chosen, ...(instanceId ? { instanceId } : {}) })}
					/>
				))}
			</div>
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
