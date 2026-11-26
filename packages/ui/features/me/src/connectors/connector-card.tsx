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
	onOpen: (definition: ConnectorDefinition, instanceId?: string) => void;
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

export function ConnectorArtwork({ id, hero = false }: { id: ConnectorDefinition["id"]; hero?: boolean }) {
	const { Icon } = connectorPresentation[id];
	return (
		<span
			aria-hidden
			className={`grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] ${hero ? "size-[var(--spacing-16)]" : "size-[var(--spacing-10)]"}`}
		>
			<span
				className={`block text-[var(--color-text-secondary)] ${hero ? "size-[var(--spacing-8)]" : "size-[var(--spacing-6)]"}`}
			>
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
			variant="ghost"
			className={`shrink-0 rounded-[var(--radius-full)]! bg-[var(--color-bg-subtle)] ${connected ? "text-[var(--color-success)]!" : "text-[var(--color-text-primary)]!"}`}
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
	const { key } = connectorPresentation[definition.id];
	const connected = instances.filter((item) => item.connectorId === definition.id);
	const primary = connected.find((item) => item.scope === "device") ?? connected[0];
	const status = connectorStatusKey(device, primary);
	const statusLabel = `${t(status)} · ${t(`connectors.${key}.name`)}`;
	const open = () => onOpen(definition, primary?.id);
	return (
		<section className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-bg-card)]">
			<div className="flex items-center gap-[var(--spacing-3)] px-[var(--spacing-3)] py-[var(--spacing-3)]">
				<button
					type="button"
					className="flex min-w-0 flex-1 items-center gap-[var(--spacing-3)] text-start rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
					onClick={() => onOpen(definition, primary?.id)}
				>
					<ConnectorArtwork id={definition.id} />
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
