import type { ConnectorDefinition, DeviceSummary } from "@yonder/protocol";
import { ListGroup, ListRow } from "@yonder/ui-components";
import { useAccountTimeZone, useConnectorCatalog, useConnectors, useDevices } from "@yonder/ui-data";
import { formatInstant } from "@yonder/ui-time";
import { Laptop, Smartphone } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceDisplayName } from "../components/device-display-name.ts";
import { ConnectorCard } from "./connector-card.tsx";
import { ConnectorPanel } from "./connector-panel.tsx";
import { canConfigureConnector, type LocalFilesAdapter } from "./local-files-adapter.ts";

export interface ConnectorsSectionProps {
	localFiles?: LocalFilesAdapter | undefined;
	onOpenDevices?: (() => void) | undefined;
	onTryConnector?: ((draft: string) => void) | undefined;
	onAddDevice?: ((platforms: readonly DeviceSummary["platform"][]) => void) | undefined;
}

export function ConnectorsSection({ localFiles, onOpenDevices, onAddDevice, onTryConnector }: ConnectorsSectionProps) {
	const { t, i18n } = useTranslation();
	const zone = useAccountTimeZone();
	const catalog = useConnectorCatalog(true);
	const connections = useConnectors({ apple: true });
	const devices = useDevices();
	const groups = useMemo(
		() =>
			(devices.data?.items ?? []).flatMap((device) => {
				if (device.platform === "web") return [];
				const definitions = catalog.data?.items.filter(
					(item) =>
						item.platforms.includes(device.platform) &&
						(!device.current ||
							!item.id.startsWith("apple-") ||
							localFiles?.supports?.(item.id) ||
							connections.data?.items.some(
								(source) => source.deviceId === device.id && source.connectorId === item.id,
							)),
				);
				return definitions?.length ? [{ device, definitions, target: `connector-device-${device.id}` }] : [];
			}),
		[devices.data, catalog.data, connections.data, localFiles],
	);
	const loading = catalog.isLoading || connections.isLoading || devices.isLoading;
	const failed =
		(catalog.isError && !catalog.data) ||
		(connections.isError && !connections.data) ||
		(devices.isError && !devices.data);
	const nav = useRef<HTMLElement>(null);
	const clicked = useRef<{ target: string; scrollTop: number } | null>(null);
	const [scrolledTarget, setScrolledTarget] = useState<string>();
	const activeTarget = groups.some(({ target }) => target === scrolledTarget) ? scrolledTarget : groups[0]?.target;

	useEffect(() => {
		if (loading || failed || groups.length < 2) return;
		const bar = nav.current;
		const scroller = bar?.closest<HTMLElement>("[data-frame-scroll]");
		const list = bar?.parentElement;
		if (!bar || !scroller || !list) return;
		const sections = Array.from(list.querySelectorAll<HTMLElement>(":scope > section"));
		const first = sections[0];
		const last = sections.at(-1);
		if (!first || !last) return;

		const update = () => {
			const { scrollTop, scrollHeight, clientHeight } = scroller;
			// Short groups can share the same reachable scroll position. Keep the explicit choice until the user scrolls.
			const choice = clicked.current;
			if (choice?.scrollTop === scrollTop && sections.some((group) => group.id === choice.target)) return;
			clicked.current = null;
			if (scrollTop > 0 && scrollTop + clientHeight >= scrollHeight - 1) {
				setScrolledTarget(last.id);
				return;
			}
			const margin = Number.parseFloat(getComputedStyle(first).scrollMarginTop) || 0;
			const line = Math.max(bar.getBoundingClientRect().bottom, scroller.getBoundingClientRect().top + margin) + 1;
			const current = sections.findLast((group) => group.getBoundingClientRect().top <= line);
			setScrolledTarget((current ?? first).id);
		};

		update();
		scroller.addEventListener("scroll", update, { passive: true });
		const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
		resize?.observe(list);
		resize?.observe(scroller);
		return () => {
			scroller.removeEventListener("scroll", update);
			resize?.disconnect();
		};
	}, [groups, loading, failed]);

	useEffect(() => {
		if (!activeTarget || loading || failed) return;
		const bar = nav.current;
		const link = bar?.querySelector('[aria-current="true"]');
		if (!bar || !link) return;
		const { left, right } = link.getBoundingClientRect();
		const bounds = bar.getBoundingClientRect();
		const offset = left < bounds.left ? left - bounds.left : Math.max(0, right - bounds.right);
		if (offset) bar.scrollBy({ left: offset, behavior: "instant" });
	}, [activeTarget, loading, failed]);

	const [selected, setSelected] = useState<{
		connectorId: ConnectorDefinition["id"];
		deviceId: string;
		instanceId?: string;
	} | null>(null);
	const selectedGroup = groups.find(({ device }) => device.id === selected?.deviceId);
	const device = selectedGroup?.device;
	const definition = selectedGroup?.definitions.find((item) => item.id === selected?.connectorId);
	const instance = connections.data?.items.find(
		(item) => item.id === selected?.instanceId && item.deviceId === selected?.deviceId,
	);
	const detailVisible = device && definition && (!selected?.instanceId || instance);
	useEffect(() => {
		if (selected && !detailVisible) setSelected(null);
	}, [selected, detailVisible]);

	const open = (device: DeviceSummary, definition: ConnectorDefinition, instanceId?: string) => {
		setSelected({
			connectorId: definition.id,
			deviceId: device.id,
			...(instanceId ? { instanceId } : {}),
		});
	};
	function label(item: DeviceSummary) {
		const displayName = deviceDisplayName(item);
		const name = item.current ? `${displayName} · ${t("me.account.sessionCurrent")}` : displayName;
		if (!isDuplicate(item)) return name;
		return `${name} · ${t(`me.devices.platforms.${item.platform}`)} · ${formatInstant(item.lastSeenAt, { zone, locale: i18n.resolvedLanguage ?? i18n.language, style: "dateTime", width: "short", seconds: true })}`;
	}
	function isDuplicate(item: DeviceSummary) {
		return groups.some(({ device }) => device.id !== item.id && deviceDisplayName(device) === deviceDisplayName(item));
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
	if (!groups.length) {
		const platforms = catalog.data?.items.flatMap((definition) => definition.platforms) ?? [];
		const addDevice = platforms.length && onAddDevice ? () => onAddDevice(platforms) : undefined;
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
					{groups.map(({ device: item, target }) => {
						const Icon = item.platform === "ios" || item.platform === "android" ? Smartphone : Laptop;
						return (
							<a
								key={item.id}
								href={`#${target}`}
								aria-label={label(item)}
								aria-current={activeTarget === target || undefined}
								className="inline-flex shrink-0 items-center gap-[var(--spacing-2)] rounded-[var(--radius-md)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] aria-[current=true]:bg-[var(--color-bg-selected)] aria-[current=true]:text-[var(--color-text-primary)]"
								onClick={(event) => {
									event.preventDefault();
									const group = Array.from(nav.current?.parentElement?.children ?? []).find(
										(element) => element.id === target,
									);
									if (!(group instanceof HTMLElement)) return;
									group.scrollIntoView({ block: "start", behavior: "instant" });
									group.focus({ preventScroll: true });
									const scroller = group.closest("[data-frame-scroll]");
									clicked.current = scroller ? { target, scrollTop: scroller.scrollTop } : null;
									setScrolledTarget(target);
								}}
							>
								<Icon size={18} strokeWidth={1.7} className="shrink-0" aria-hidden />
								<span className="max-w-[calc(var(--spacing-16)*2)] truncate">{deviceDisplayName(item)}</span>
								{item.current ? (
									<span className="text-micro text-[var(--color-accent-text)]">{t("me.account.sessionCurrent")}</span>
								) : null}
							</a>
						);
					})}
				</nav>
				{groups.map(({ device, definitions, target }) => {
					const instances = connections.data?.items.filter((item) => item.deviceId === device.id) ?? [];
					const duplicate = isDuplicate(device);
					const name = deviceDisplayName(device);
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
									{name}
									{device.current ? (
										<span className="ms-[var(--spacing-2)] text-micro text-[var(--color-accent-text)]">
											{t("me.account.sessionCurrent")}
										</span>
									) : null}
								</h2>
								<p className="text-caption text-[var(--color-text-tertiary)]">
									{name !== device.name ? `${device.name} · ` : ""}
									{t(`me.devices.platforms.${device.platform}`)} · {t(`me.devices.${device.status}`)}
									{duplicate
										? ` · ${formatInstant(device.lastSeenAt, { zone, locale: i18n.resolvedLanguage ?? i18n.language, style: "dateTime", width: "short", seconds: true })}`
										: ""}
								</p>
							</header>
							<div className="@container">
								<div className="grid grid-cols-1 gap-[var(--spacing-3)] @[40rem]:grid-cols-2">
									{definitions.map((def) => (
										<ConnectorCard
											key={def.id}
											definition={def}
											device={device}
											instances={instances}
											canConfigure={canConfigureConnector(device, def, localFiles)}
											onOpen={(definition, instanceId) => open(device, definition, instanceId)}
										/>
									))}
								</div>
							</div>
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
					eligibleDevices={groups
						.filter(({ definitions }) => definitions.some((item) => item.id === definition.id))
						.map(({ device: candidate }) => candidate)}
					onTry={onTryConnector}
					onClose={() => setSelected(null)}
				/>
			) : null}
		</>
	);
}
