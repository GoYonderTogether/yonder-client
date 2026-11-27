import type { ConnectorDefinition, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { IconButton } from "@yonder/ui-components";
import {
	AudioLines,
	CalendarDays,
	Check,
	FolderSearch,
	Images,
	Loader,
	MonitorCog,
	NotebookPen,
	Plus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { type ConnectorGroup, groupKey } from "./connector-groups.ts";

export interface ConnectorCardProps {
	group: ConnectorGroup;
	device: DeviceSummary;
	/** What the account has granted; only this device's grants count, folder grants included. */
	instances: readonly ConnectorInstance[];
	onOpen: () => void;
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

export type ConnectorStatus = "none" | "connected" | "waiting";

/** Where a connector stands on one device: nothing granted, granted and ready, or granted and not ready yet. */
export function connectorStatus(
	device: DeviceSummary,
	group: ConnectorGroup,
	instances: readonly ConnectorInstance[],
): ConnectorStatus {
	const granted = instances.filter(
		(item) => item.deviceId === device.id && group.members.some((member) => member.id === item.connectorId),
	);
	if (!granted.length) return "none";
	return device.status === "online" && granted.some((item) => item.status === "offline") ? "waiting" : "connected";
}

const STATUS_LABEL = {
	none: "connectors.connect",
	connected: "connectors.connected",
	waiting: "connectors.connectedNotReady",
} as const;

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
 * One connector on one device: logo, name, one line of what it does, and one icon for where it
 * stands (plus, check, spinner). The whole card opens the connector. An offline device greys its
 * cards; the device group's heading says so once, the card never repeats it in words.
 */
export function ConnectorCard({ group, device, instances, onOpen }: ConnectorCardProps) {
	const { t } = useTranslation();
	const key = groupKey(group);
	const Icon = group.id === "computer" ? MonitorCog : connectorPresentation[group.id].Icon;
	const status = connectorStatus(device, group, instances);
	const stateKey =
		device.status === "offline" && status !== "none" ? "connectors.connectedOffline" : STATUS_LABEL[status];
	return (
		<button
			type="button"
			aria-label={`${t(stateKey)} · ${t(`connectors.${key}.name`)}`}
			onClick={onOpen}
			className={`flex w-full items-center gap-[var(--spacing-3)] rounded-[var(--radius-card)] bg-[var(--color-bg-card)] p-[var(--spacing-4)] text-start focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${device.status === "offline" ? "opacity-60" : ""}`}
		>
			<Icon size={24} className="shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
			<span className="min-w-0 flex-1">
				<span className="block text-body font-medium">{t(`connectors.${key}.name`)}</span>
				<span className="block text-caption text-[var(--color-text-tertiary)]">
					{t(`connectors.${key}.description`)}
				</span>
			</span>
			<span
				aria-hidden
				className={`grid size-8 shrink-0 place-items-center rounded-[var(--radius-full)] ${status === "none" ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]"}`}
			>
				{status === "none" ? <Plus size={18} /> : status === "waiting" ? <Loader size={18} /> : <Check size={18} />}
			</span>
		</button>
	);
}
