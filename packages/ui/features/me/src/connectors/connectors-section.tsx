import type { ConnectorDefinition, DeviceSummary } from "@yonder/protocol";
import { ListGroup, ListRow } from "@yonder/ui-components";
import { useConnectorCatalog, useConnectors, useDevices } from "@yonder/ui-data";
import { Globe, Laptop, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConnectorCard } from "./connector-card.tsx";
import { ConnectorPanel } from "./connector-panel.tsx";
import type { LocalFilesAdapter } from "./local-files-adapter.ts";

export interface ConnectorsSectionProps {
	localFiles?: LocalFilesAdapter | undefined;
	onOpenDevices?: (() => void) | undefined;
}

export function ConnectorsSection({ localFiles, onOpenDevices }: ConnectorsSectionProps) {
	const { t, i18n } = useTranslation();
	const catalog = useConnectorCatalog();
	const connections = useConnectors();
	const devices = useDevices();
	const [selected, setSelected] = useState<{
		connectorId: ConnectorDefinition["id"];
		deviceId: string;
		instanceId?: string;
	} | null>(null);
	const items = devices.data?.items ?? [];
	const device = items.find((item) => item.id === selected?.deviceId);
	const definition = catalog.data?.items.find(
		(item) => item.id === selected?.connectorId && device && item.platforms.includes(device.platform),
	);
	const instance = connections.data?.items.find(
		(item) => item.id === selected?.instanceId && item.deviceId === selected?.deviceId,
	);
	const detailVisible = device && definition && (!selected?.instanceId || instance);
	useEffect(() => {
		if (selected && !detailVisible) setSelected(null);
	}, [selected, detailVisible]);

	const open = (device: DeviceSummary, definition: ConnectorDefinition, instanceId?: string) => {
		setSelected({ connectorId: definition.id, deviceId: device.id, ...(instanceId ? { instanceId } : {}) });
	};
	function label(item: DeviceSummary) {
		const name = item.current ? `${item.name} · ${t("me.account.sessionCurrent")}` : item.name;
		if (!items.some((other) => other.id !== item.id && other.name === item.name)) return name;
		return `${name} · ${t(`me.devices.platforms.${item.platform}`)} · ${new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "short", timeStyle: "medium" }).format(new Date(item.lastSeenAt))}`;
	}
	if (catalog.isLoading || connections.isLoading || devices.isLoading)
		return (
			<ListGroup>
				<ListRow title={t("app.loading")} disabled />
			</ListGroup>
		);
	if (
		(catalog.isError && !catalog.data) ||
		(connections.isError && !connections.data) ||
		(devices.isError && !devices.data)
	)
		return (
			<ListGroup>
				<ListRow
					title={t("connectors.loadFailed")}
					trailing={t("app.retry")}
					onClick={() => {
						void catalog.refetch();
						void connections.refetch();
						void devices.refetch();
					}}
				/>
			</ListGroup>
		);
	if (!items.length)
		return (
			<ListGroup>
				<ListRow
					title={t("me.devices.emptyTitle")}
					{...(onOpenDevices ? { trailing: t("connectors.viewDevices"), onClick: onOpenDevices } : { disabled: true })}
				/>
			</ListGroup>
		);
	return (
		<>
			<div className="flex min-w-0 flex-col gap-[var(--spacing-6)]">
				<nav
					aria-label={t("connectors.device")}
					className="sticky top-0 z-10 flex min-w-0 max-w-full shrink-0 gap-[var(--spacing-2)] overflow-x-auto bg-[var(--color-bg-base)] py-[var(--spacing-2)]"
				>
					{items.map((item) => {
						const Icon = item.platform === "web" ? Globe : /ios|android/.test(item.platform) ? Smartphone : Laptop;
						const target = `connector-device-${item.id}`;
						return (
							<a
								key={item.id}
								href={`#${target}`}
								aria-label={label(item)}
								className="inline-flex shrink-0 items-center gap-[var(--spacing-2)] rounded-[var(--radius-md)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
								onClick={(event) => {
									event.preventDefault();
									const group = document.getElementById(target);
									group?.scrollIntoView({ block: "start", behavior: "instant" });
									group?.focus({ preventScroll: true });
								}}
							>
								<Icon size={18} strokeWidth={1.7} className="shrink-0" aria-hidden />
								<span className="max-w-[calc(var(--spacing-16)*2)] truncate">{item.name}</span>
								{item.current ? (
									<span className="text-micro text-[var(--color-accent-text)]">{t("me.account.sessionCurrent")}</span>
								) : null}
							</a>
						);
					})}
				</nav>
				{items.map((device) => {
					const definitions = catalog.data?.items.filter((item) => item.platforms.includes(device.platform)) ?? [];
					const instances = connections.data?.items.filter((item) => item.deviceId === device.id) ?? [];
					const target = `connector-device-${device.id}`;
					const duplicate = items.some((item) => item.id !== device.id && item.name === device.name);
					return (
						<section
							key={device.id}
							id={target}
							tabIndex={-1}
							aria-label={label(device)}
							className="min-w-0 scroll-mt-[var(--spacing-16)] space-y-[var(--spacing-3)]"
						>
							<header>
								<h2 className="break-words text-body font-medium">
									{device.name}
									{device.current ? (
										<span className="ms-[var(--spacing-2)] text-micro text-[var(--color-accent-text)]">
											{t("me.account.sessionCurrent")}
										</span>
									) : null}
								</h2>
								<p className="text-caption text-[var(--color-text-tertiary)]">
									{t(`me.devices.platforms.${device.platform}`)} · {t(`me.devices.${device.status}`)}
									{duplicate
										? ` · ${new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "short", timeStyle: "medium" }).format(new Date(device.lastSeenAt))}`
										: ""}
								</p>
							</header>
							{definitions.length ? (
								<div className="@container">
									<div className="grid grid-cols-1 gap-[var(--spacing-3)] @[40rem]:grid-cols-2">
										{definitions.map((def) => (
											<ConnectorCard
												key={def.id}
												definition={def}
												device={device}
												instances={instances}
												onOpen={(definition, instanceId) => open(device, definition, instanceId)}
											/>
										))}
									</div>
								</div>
							) : (
								<p className="text-caption text-[var(--color-text-tertiary)]">{t("connectors.noConnectorsOnDevice")}</p>
							)}
						</section>
					);
				})}
			</div>
			{detailVisible && selected && definition && device ? (
				<ConnectorPanel
					key={`${selected.deviceId}:${selected.connectorId}:${selected.instanceId ?? "new"}`}
					device={device}
					definition={definition}
					instance={instance}
					localFiles={localFiles}
					onOpenDevices={onOpenDevices}
					onClose={() => setSelected(null)}
				/>
			) : null}
		</>
	);
}
