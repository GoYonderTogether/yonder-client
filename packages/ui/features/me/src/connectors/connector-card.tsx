import type { ConnectorDefinition, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
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

/** The connector's own copy lives under `connectors.<key>`; the id is kebab-case, the key is not. */
export const connectorPresentation = {
	"local-files": { key: "localFiles", Icon: FolderSearch },
	"computer-control": { key: "computerControl", Icon: MonitorCog },
	"apple-calendar": { key: "appleCalendar", Icon: CalendarDays },
	"apple-photos": { key: "applePhotos", Icon: Images },
	"apple-notes": { key: "appleNotes", Icon: NotebookPen },
	"apple-voice-memos": { key: "appleVoiceMemos", Icon: AudioLines },
} as const satisfies Record<ConnectorDefinition["id"], { key: string; Icon: typeof FolderSearch }>;

const folderGlyph = new URL("./assets/folder.svg", import.meta.url).href;
const desktopGlyph = new URL("./assets/desktop.svg", import.meta.url).href;
const laptopGlyph = new URL("./assets/laptop.svg", import.meta.url).href;
const phoneGlyph = new URL("./assets/phone.svg", import.meta.url).href;

function Glyph({ src }: { src: string }) {
	return (
		<span
			aria-hidden
			className="block size-full bg-current"
			style={{ maskImage: `url("${src}")`, maskSize: "contain" }}
		/>
	);
}

export function ConnectorArtwork({ id }: { id: ConnectorDefinition["id"] }) {
	const { Icon } = connectorPresentation[id];
	return (
		<span
			aria-hidden
			className="grid size-[var(--spacing-10)] shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-page)]"
		>
			<span className="block size-[var(--spacing-6)] text-[var(--color-text-secondary)]">
				{id === "local-files" ? (
					<Glyph src={folderGlyph} />
				) : id === "computer-control" ? (
					<Glyph src={desktopGlyph} />
				) : (
					<Icon aria-hidden className="size-full" />
				)}
			</span>
		</span>
	);
}

export function ConnectorDeviceIcon({ platform }: { platform: DeviceSummary["platform"] }) {
	return (
		<span className="block size-[var(--spacing-4)] shrink-0 text-[var(--color-text-secondary)]">
			<Glyph
				src={
					platform === "ios" || platform === "android" ? phoneGlyph : platform === "macos" ? laptopGlyph : desktopGlyph
				}
			/>
		</span>
	);
}

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

export interface ConnectorCardProps {
	group: ConnectorGroup;
	device: DeviceSummary;
	/** What the account has granted; only this device's grants count, folder grants included. */
	instances: readonly ConnectorInstance[];
	onOpen: () => void;
}

/**
 * One connector on one device: logo, name, one line of what it does, and one icon for where it
 * stands (plus, check, spinner). The whole card opens the connector. An offline device greys its
 * cards; the device group's heading says so once, the card never repeats it in words.
 */
export function ConnectorCard({ group, device, instances, onOpen }: ConnectorCardProps) {
	const { t } = useTranslation();
	const key = groupKey(group);
	const status = connectorStatus(device, group, instances);
	const stateKey =
		device.status === "offline" && status !== "none" ? "connectors.connectedOffline" : STATUS_LABEL[status];
	return (
		<button
			type="button"
			aria-label={`${t(stateKey)} · ${t(`connectors.${key}.name`)}`}
			onClick={onOpen}
			className={`flex w-full items-center gap-[var(--spacing-3)] rounded-[var(--radius-card)] bg-[var(--color-bg-card)] p-[var(--spacing-3)] text-start focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${device.status === "offline" ? "opacity-60" : ""}`}
		>
			<ConnectorArtwork id={group.id === "computer" ? "computer-control" : group.id} />
			<span className="min-w-0 flex-1">
				<span className="block text-body font-medium">{t(`connectors.${key}.name`)}</span>
				<span className="block text-caption text-[var(--color-text-tertiary)]">
					{t(`connectors.${key}.description`)}
				</span>
			</span>
			<span
				aria-hidden
				className={`grid size-8 shrink-0 place-items-center rounded-[var(--radius-full)] bg-[var(--color-bg-subtle)] ${status === "connected" ? "text-[var(--color-success)]" : "text-[var(--color-text-primary)]"}`}
			>
				{status === "none" ? <Plus size={18} /> : status === "waiting" ? <Loader size={18} /> : <Check size={18} />}
			</span>
		</button>
	);
}
