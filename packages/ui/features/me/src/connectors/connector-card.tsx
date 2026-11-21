import type { ConnectorDefinition, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { Button, IconButton } from "@yonder/ui-components";
import { AudioLines, CalendarDays, Check, FolderSearch, Images, MonitorCog, NotebookPen, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface ConnectorCardProps {
	definition: ConnectorDefinition;
	device: DeviceSummary;
	/** What this device has connected under the connector, folder grants included. */
	instances: readonly ConnectorInstance[];
	canConfigure: boolean;
	onOpen: (definition: ConnectorDefinition, instanceId?: string, connect?: boolean) => void;
}

/** The connector's own copy lives under `connectors.<key>`; the id is kebab-case, the key is not. */
export const connectorPresentation = {
	"local-files": { key: "localFiles", Icon: FolderSearch },
	"computer-control": { key: "computerControl", Icon: MonitorCog },
	"apple-calendar": { key: "appleCalendar", Icon: CalendarDays },
	"apple-photos": { key: "applePhotos", Icon: Images },
	"apple-notes": { key: "appleNotes", Icon: NotebookPen },
	"apple-voice-memos": { key: "appleVoiceMemos", Icon: AudioLines },
} as const satisfies Record<ConnectorDefinition["id"], { key: string; Icon: typeof FolderSearch }>;

/** Where a connector stands on a device, as the label of its button. */
export function connectorStatusKey(device: DeviceSummary, primary: ConnectorInstance | undefined): string {
	if (!primary) return "connectors.connect";
	if (device.status === "offline") return "connectors.connectedOffline";
	return primary.status === "offline" ? "connectors.connectedNotReady" : "connectors.connected";
}

export function ConnectorAction({
	label,
	connected = false,
	onClick,
}: {
	label: string;
	connected?: boolean;
	onClick: () => void;
}) {
	return (
		<IconButton
			aria-label={label}
			title={label}
			variant={connected ? "secondary" : "primary"}
			className="shrink-0 rounded-[var(--radius-full)]!"
			onClick={onClick}
		>
			{connected ? <Check size={20} aria-hidden /> : <Plus size={20} aria-hidden />}
		</IconButton>
	);
}

/**
 * One connector on one device: icon, name, one line, and a button that says where it stands. The
 * connectors page and the first-run setup draw the same card, so a connector looks the same wherever
 * it is offered. Folder grants from before the whole-device scope are listed under it to be managed.
 */
export function ConnectorCard({ definition, device, instances, canConfigure, onOpen }: ConnectorCardProps) {
	const { t } = useTranslation();
	const { key, Icon } = connectorPresentation[definition.id];
	const connected = instances.filter((item) => item.connectorId === definition.id);
	const primary = connected.find((item) => item.scope === "device") ?? connected[0];
	const status = connectorStatusKey(device, primary);
	const statusLabel = `${t(status)} · ${t(`connectors.${key}.name`)}`;
	const open = () => onOpen(definition, primary?.id, !primary && canConfigure && definition.id.startsWith("apple-"));
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
				{status === "connectors.connected" || (!primary && canConfigure) ? (
					<ConnectorAction label={statusLabel} connected={!!primary} onClick={open} />
				) : primary ? (
					<Button aria-label={statusLabel} onClick={open} size="sm">
						{t(status)}
					</Button>
				) : null}
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
