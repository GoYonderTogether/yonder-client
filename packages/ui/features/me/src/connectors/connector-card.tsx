import type { ConnectorDefinition, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { FolderSearch, MonitorCog } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface ConnectorCardProps {
	definition: ConnectorDefinition;
	device: DeviceSummary;
	/** What this device has connected under the connector, folder grants included. */
	instances: readonly ConnectorInstance[];
	onOpen: (definition: ConnectorDefinition, instanceId?: string) => void;
}

/** The connector's own copy lives under `connectors.<key>`; the id is kebab-case, the key is not. */
export function connectorKey(definition: ConnectorDefinition): "computerControl" | "localFiles" {
	return definition.id === "computer-control" ? "computerControl" : "localFiles";
}

/** Where a connector stands on a device, as the label of its button. */
export function connectorStatusKey(device: DeviceSummary, primary: ConnectorInstance | undefined): string {
	if (!primary) return "connectors.connect";
	if (device.status === "offline") return "connectors.connectedOffline";
	return primary.status === "offline" ? "connectors.connectedNotReady" : "connectors.connected";
}

/**
 * One connector on one device: icon, name, one line, and a button that says where it stands. The
 * connectors page and the first-run setup draw the same card, so a connector looks the same wherever
 * it is offered. Folder grants from before the whole-device scope are listed under it to be managed.
 */
export function ConnectorCard({ definition, device, instances, onOpen }: ConnectorCardProps) {
	const { t } = useTranslation();
	const key = connectorKey(definition);
	const Icon = definition.id === "computer-control" ? MonitorCog : FolderSearch;
	const connected = instances.filter((item) => item.connectorId === definition.id);
	const primary = connected.find((item) => item.scope === "device") ?? connected[0];
	const status = connectorStatusKey(device, primary);
	return (
		<section className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-bg-card)]">
			<div className="flex items-center gap-[var(--spacing-3)] p-[var(--spacing-4)]">
				<button
					type="button"
					className="flex min-w-0 flex-1 items-center gap-[var(--spacing-3)] text-start rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
					onClick={() => onOpen(definition, primary?.id)}
				>
					<Icon size={24} className="shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
					<span className="min-w-0 flex-1">
						<span className="block text-body font-medium">{t(`connectors.${key}.name`)}</span>{" "}
						<span className="block text-caption text-[var(--color-text-tertiary)]">
							{t(`connectors.${key}.description`)}
						</span>
					</span>
				</button>
				<Button
					size="sm"
					aria-label={`${t(status)} · ${t(`connectors.${key}.name`)}`}
					onClick={() => onOpen(definition, primary?.id)}
				>
					{t(status)}
				</Button>
			</div>
			{connected
				.filter((item) => connected.length > 1 || item.scope === "folder")
				.map((item) => (
					<div
						key={item.id}
						className="flex items-center gap-[var(--spacing-3)] border-t border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-3)]"
					>
						<div className="min-w-0 flex-1">
							<p className="truncate text-body">{item.name}</p>
							<p className="text-caption text-[var(--color-text-tertiary)]">
								{t(
									device.status === "offline"
										? "connectors.connectedOffline"
										: item.status === "offline"
											? "connectors.connectedNotReady"
											: "connectors.connected",
								)}
							</p>
						</div>
						<Button
							size="sm"
							variant="ghost"
							aria-label={`${t("connectors.manage")} ${item.name}`}
							onClick={() => onOpen(definition, item.id)}
						>
							{t("connectors.manage")}
						</Button>
					</div>
				))}
		</section>
	);
}
