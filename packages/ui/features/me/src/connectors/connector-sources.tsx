import type { ConnectorDefinition, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { ListGroup, ListRow } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";
import { deviceDisplayName } from "../components/device-display-name.ts";
import { ConnectorAction, connectorPresentation } from "./connector-card.tsx";
import { canConfigureConnector, type LocalFilesAdapter } from "./local-files-adapter.ts";

export function ConnectorSources({
	definitions,
	instances,
	devices,
	localFiles,
	onConnect,
}: {
	definitions: readonly ConnectorDefinition[];
	instances: readonly ConnectorInstance[];
	devices: readonly DeviceSummary[];
	localFiles?: LocalFilesAdapter | undefined;
	onConnect: (device: DeviceSummary, definition: ConnectorDefinition) => void;
}) {
	const { t } = useTranslation();
	const devicesById = new Map(devices.map((device) => [device.id, device]));
	const current = devices.find((device) => device.current);
	const cards = definitions.flatMap((definition) => {
		const sources = new Map<string, ConnectorInstance>();
		for (const instance of instances) {
			if (instance.connectorId !== definition.id) continue;
			if (!sources.has(instance.deviceId) || instance.status === "online") sources.set(instance.deviceId, instance);
		}
		const connect = current && !sources.has(current.id) && canConfigureConnector(current, definition, localFiles);
		if (!sources.size && !connect) return [];
		const { key, Icon } = connectorPresentation[definition.id];
		const name = t(`connectors.${key}.name`);
		return (
			<section key={definition.id} aria-label={name} className="rounded-[var(--radius-card)] bg-[var(--color-bg-card)]">
				<header className="flex items-center gap-[var(--spacing-3)] p-[var(--spacing-4)]">
					<Icon size={24} className="shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
					<div className="min-w-0 flex-1">
						<h2 className="text-body font-medium">{name}</h2>
						<p className="text-caption text-[var(--color-text-tertiary)]">{t(`connectors.${key}.description`)}</p>
					</div>
					{connect ? (
						<ConnectorAction
							label={`${t("connectors.connect")} · ${name}`}
							onClick={() => onConnect(current, definition)}
						/>
					) : null}
				</header>
				{sources.size ? (
					<ul className="divide-y divide-[var(--color-border-subtle)] border-t border-[var(--color-border-subtle)]">
						{[...sources.values()].map((source) => {
							const device = devicesById.get(source.deviceId);
							const ready = source.status === "online" && device?.status !== "offline";
							return (
								<li
									key={source.deviceId}
									className="flex justify-between gap-[var(--spacing-3)] px-[var(--spacing-4)] py-[var(--spacing-3)] text-caption"
								>
									<span className="min-w-0 break-words">
										{device ? deviceDisplayName(device) : source.deviceName}
										{device ? ` · ${t(`me.devices.platforms.${device.platform}`)}` : ""}
									</span>
									<span className="shrink-0 text-[var(--color-text-tertiary)]">
										{t(ready ? "connectors.available" : "connectors.sourceNotReady")}
									</span>
								</li>
							);
						})}
					</ul>
				) : null}
			</section>
		);
	});
	return cards.length ? (
		<div className="@container">
			<div className="grid grid-cols-1 items-start gap-[var(--spacing-3)] @[40rem]:grid-cols-2">{cards}</div>
		</div>
	) : (
		<ListGroup>
			<ListRow title={t("connectors.noSources")} disabled />
		</ListGroup>
	);
}
