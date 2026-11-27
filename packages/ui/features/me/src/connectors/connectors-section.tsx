import type { DeviceSummary } from "@yonder/protocol";
import { ListGroup, ListRow } from "@yonder/ui-components";
import { useConnectorCatalog, useConnectors, useDevices } from "@yonder/ui-data";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceDisplayName } from "../components/device-display-name.ts";
import { ConnectorCard } from "./connector-card.tsx";
import { groupConnectors } from "./connector-groups.ts";
import { ConnectorPanel } from "./connector-panel.tsx";
import type { LocalFilesAdapter } from "./local-files-adapter.ts";

export interface ConnectorsSectionProps {
	localFiles?: LocalFilesAdapter | undefined;
	onOpenDevices?: (() => void) | undefined;
	onTryConnector?: ((draft: string) => void) | undefined;
	onAddDevice?: ((platforms: readonly DeviceSummary["platform"][]) => void) | undefined;
}

const ORDER: readonly DeviceSummary["platform"][] = ["macos", "windows", "linux", "ios", "android"];
const TAB =
	"inline-flex shrink-0 items-center gap-[var(--spacing-2)] rounded-[var(--radius-md)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] aria-[current=true]:bg-[var(--color-bg-selected)] aria-[current=true]:text-[var(--color-text-primary)]";

export function ConnectorsSection({ localFiles, onOpenDevices, onAddDevice, onTryConnector }: ConnectorsSectionProps) {
	const { t } = useTranslation();
	const catalog = useConnectorCatalog(true);
	const connections = useConnectors({ apple: true });
	const devices = useDevices();
	const instances = connections.data?.items ?? [];
	const rows = useMemo(
		() =>
			(devices.data?.items ?? [])
				.flatMap((device) => {
					if (device.platform === "web") return [];
					const definitions =
						catalog.data?.items.filter(
							(item) =>
								item.platforms.includes(device.platform) &&
								(!device.current ||
									!item.id.startsWith("apple-") ||
									localFiles?.supports?.(item.id) ||
									connections.data?.items.some(
										(source) => source.deviceId === device.id && source.connectorId === item.id,
									)),
						) ?? [];
					return definitions.length
						? [{ device, cards: groupConnectors(definitions), target: `connector-device-${device.id}` }]
						: [];
				})
				.sort((a, b) => ORDER.indexOf(a.device.platform) - ORDER.indexOf(b.device.platform)),
		[devices.data, catalog.data, connections.data, localFiles],
	);
	const platforms = ORDER.filter((platform) => rows.some(({ device }) => device.platform === platform));
	const loading = catalog.isLoading || connections.isLoading || devices.isLoading;
	const failed =
		(catalog.isError && !catalog.data) ||
		(connections.isError && !connections.data) ||
		(devices.isError && !devices.data);

	const nav = useRef<HTMLElement>(null);
	const [active, setActive] = useState<DeviceSummary["platform"]>();
	const activePlatform = active && platforms.includes(active) ? active : platforms[0];
	const clicked = useRef<{ platform: DeviceSummary["platform"]; scrollTop: number } | null>(null);

	useEffect(() => {
		if (loading || failed || platforms.length < 2) return;
		const bar = nav.current;
		const scroller = bar?.closest<HTMLElement>("[data-frame-scroll]");
		const list = bar?.parentElement;
		if (!bar || !scroller || !list) return;
		const sections = Array.from(list.querySelectorAll<HTMLElement>(":scope > section"));
		const update = () => {
			const choice = clicked.current;
			if (choice && choice.scrollTop === scroller.scrollTop) return;
			clicked.current = null;
			const line = bar.getBoundingClientRect().bottom + 1;
			const current = sections.findLast((section) => section.getBoundingClientRect().top <= line) ?? sections[0];
			const row = rows.find(({ target }) => target === current?.id);
			if (row) setActive(row.device.platform);
		};
		update();
		scroller.addEventListener("scroll", update, { passive: true });
		return () => scroller.removeEventListener("scroll", update);
	}, [rows, platforms.length, loading, failed]);

	const [selected, setSelected] = useState<{ groupId: string; deviceId: string } | null>(null);
	const selectedRow = rows.find(({ device }) => device.id === selected?.deviceId);
	const selectedCard = selectedRow?.cards.find((card) => card.id === selected?.groupId);
	useEffect(() => {
		if (selected && !selectedCard) setSelected(null);
	}, [selected, selectedCard]);

	const catalogPlatforms = catalog.data?.items.flatMap((definition) => definition.platforms) ?? [];
	function jump(platform: DeviceSummary["platform"]) {
		const row = rows.find(({ device }) => device.platform === platform);
		const section = row ? document.getElementById(row.target) : null;
		if (!section) return;
		section.scrollIntoView({ block: "start", behavior: "instant" });
		section.focus({ preventScroll: true });
		const scroller = section.closest("[data-frame-scroll]");
		clicked.current = scroller ? { platform, scrollTop: scroller.scrollTop } : null;
		setActive(platform);
	}

	if (loading)
		return (
			<ListGroup>
				<ListRow title={t("app.loading")} disabled />
			</ListGroup>
		);
	if (failed)
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
	if (!rows.length) {
		const addDevice = catalogPlatforms.length && onAddDevice ? () => onAddDevice(catalogPlatforms) : undefined;
		const onClick = addDevice ?? onOpenDevices;
		return (
			<ListGroup>
				<ListRow
					title={t(devices.data?.items.length ? "connectors.empty" : "me.devices.emptyTitle")}
					{...(onClick
						? { trailing: t(addDevice ? "me.devices.add" : "connectors.viewDevices"), onClick }
						: { disabled: true })}
				/>
			</ListGroup>
		);
	}
	return (
		<>
			<div className="flex min-w-0 flex-col gap-[var(--spacing-6)]">
				<nav
					ref={nav}
					aria-label={t("connectors.device")}
					className="sticky top-0 z-10 flex min-w-0 max-w-full shrink-0 gap-[var(--spacing-2)] overflow-x-auto bg-[var(--color-bg-base)] py-[var(--spacing-2)]"
				>
					{platforms.map((platform) => (
						<button
							key={platform}
							type="button"
							aria-current={activePlatform === platform || undefined}
							className={TAB}
							onClick={() => jump(platform)}
						>
							{t(`me.devices.platforms.${platform}`)}
						</button>
					))}
					{onAddDevice ? (
						<button type="button" className={TAB} onClick={() => onAddDevice(catalogPlatforms)}>
							<Plus size={16} aria-hidden />
							{t("me.devices.add")}
						</button>
					) : null}
				</nav>
				{rows.map(({ device, cards, target }) => (
					<section
						key={device.id}
						id={target}
						tabIndex={-1}
						aria-label={deviceDisplayName(device)}
						className="min-w-0 scroll-mt-[var(--spacing-16)] space-y-[var(--spacing-3)]"
					>
						<header>
							<h2 className="break-words text-body font-medium">{deviceDisplayName(device)}</h2>
							<p className="text-caption text-[var(--color-text-tertiary)]">
								{t(`me.devices.platforms.${device.platform}`)}
								{device.current ? ` · ${t("me.account.sessionCurrent")}` : ""}
								{device.status === "offline" ? ` · ${t("me.devices.offline")}` : ""}
							</p>
						</header>
						<div className="@container">
							<div className="grid grid-cols-1 gap-[var(--spacing-3)] @[40rem]:grid-cols-2">
								{cards.map((group) => (
									<ConnectorCard
										key={group.id}
										group={group}
										device={device}
										instances={instances}
										onOpen={() => setSelected({ groupId: group.id, deviceId: device.id })}
									/>
								))}
							</div>
						</div>
					</section>
				))}
			</div>
			{selectedRow && selectedCard ? (
				<ConnectorPanel
					key={`${selectedRow.device.id}:${selectedCard.id}`}
					group={selectedCard}
					devices={[
						selectedRow.device,
						...rows
							.filter(
								({ device, cards }) =>
									device.id !== selectedRow.device.id && cards.some((card) => card.id === selectedCard.id),
							)
							.map(({ device }) => device),
					]}
					instances={instances}
					localFiles={localFiles}
					onTry={onTryConnector}
					onClose={() => setSelected(null)}
				/>
			) : null}
		</>
	);
}
