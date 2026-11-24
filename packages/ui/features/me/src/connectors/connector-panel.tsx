import type { ConnectorDefinition, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { useConnectorActions, useConnectors } from "@yonder/ui-data";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { Check, Laptop, Smartphone } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceDisplayName } from "../components/device-display-name.ts";
import { connectorPresentation } from "./connector-card.tsx";
import { canConfigureConnector, type LocalFilesAdapter } from "./local-files-adapter.ts";

export interface ConnectorPanelProps {
	definition: ConnectorDefinition;
	device: DeviceSummary;
	instance?: ConnectorInstance | undefined;
	localFiles?: LocalFilesAdapter | undefined;
	eligibleDevices?: readonly DeviceSummary[] | undefined;
	onTry?: ((draft: string) => void) | undefined;
	onClose: () => void;
}

function isReachable(device: DeviceSummary, instance: ConnectorInstance | undefined) {
	return device.status === "online" && instance?.scope === "device" && instance.status === "online";
}

export function ConnectorPanel({
	definition,
	device,
	instance,
	localFiles,
	eligibleDevices,
	onTry,
	onClose,
}: ConnectorPanelProps) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const radio = useId();
	const choices = eligibleDevices ?? [device];
	const liveTarget = useRef<string | undefined>(device.id);
	const [selected, setSelected] = useState(device.id);
	const target = choices.find((choice) => choice.id === selected) ?? device;
	const connections = useConnectors({ apple: true }).data?.items ?? [];
	const { key } = connectorPresentation[definition.id];
	useEffect(() => {
		if (selected === target.id) return;
		liveTarget.current = target.id;
		setSelected(target.id);
	}, [selected, target.id]);

	function grant(candidate: DeviceSummary) {
		if (candidate.id === device.id && instance) return connections.find((item) => item.id === instance.id) ?? instance;
		const grants = connections.filter((item) => item.deviceId === candidate.id && item.connectorId === definition.id);
		return grants.find((item) => item.scope === "device") ?? grants[0];
	}

	function close() {
		liveTarget.current = undefined;
		onClose();
	}

	return (
		<Overlay
			open
			title={t(`connectors.${key}.name`)}
			mode={mode}
			mobilePresentation="large-sheet"
			closeLabel={t("app.close")}
			onClose={close}
		>
			<div className="flex flex-col gap-[var(--spacing-5)] p-[var(--spacing-4)]">
				<ConnectorHero
					key={target.id}
					definition={definition}
					device={target}
					instance={grant(target)}
					localFiles={localFiles}
					isSelected={() => liveTarget.current === target.id}
					onTry={
						onTry &&
						((draft) => {
							close();
							onTry(draft);
						})
					}
				/>
				<fieldset className="flex min-w-0 flex-col gap-[var(--spacing-2)]">
					<legend className="px-[var(--spacing-2)] pb-[var(--spacing-2)] text-caption font-semibold text-[var(--color-text-secondary)]">
						{t("connectors.sheet.devices")}
					</legend>
					{choices.map((choice) => {
						const connection = grant(choice);
						const permission = choice.current ? localFiles?.permissionStatus?.(definition.id) : undefined;
						const connected =
							isReachable(choice, connection) &&
							permission !== "denied" &&
							permission !== "restricted" &&
							permission !== "unavailable" &&
							permission !== "unsupported";
						const Icon = choice.platform === "ios" || choice.platform === "android" ? Smartphone : Laptop;
						return (
							<label key={choice.id} className="cursor-pointer">
								<input
									type="radio"
									name={radio}
									className="peer sr-only"
									checked={target.id === choice.id}
									onChange={() => {
										liveTarget.current = choice.id;
										setSelected(choice.id);
									}}
								/>
								<span className="flex items-center gap-[var(--spacing-3)] rounded-[var(--radius-card)] bg-[var(--color-bg-card)] px-[var(--spacing-4)] py-[var(--spacing-3)] peer-checked:bg-[var(--color-bg-selected)] peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--color-accent)]">
									<Icon size={18} aria-hidden className="shrink-0 text-[var(--color-text-secondary)]" />
									<span className="min-w-0 flex-1">
										<span className="block truncate text-body font-medium">{deviceDisplayName(choice)}</span>
										<span className="block text-caption text-[var(--color-text-secondary)]">
											{t(`me.devices.platforms.${choice.platform}`)}
											{choice.current ? ` · ${t("me.account.sessionCurrent")}` : ""}
										</span>
									</span>
									<span
										className={
											connected
												? "shrink-0 text-caption text-[var(--color-success)]"
												: "shrink-0 text-caption text-[var(--color-text-secondary)]"
										}
									>
										{t(
											connected
												? "connectors.sheet.deviceConnected"
												: choice.status === "offline"
													? "me.devices.offline"
													: connection
														? "connectors.sheet.deviceWaiting"
														: "connectors.sheet.deviceUnconnected",
										)}
									</span>
									{target.id === choice.id ? (
										<Check size={18} aria-hidden className="shrink-0 text-[var(--color-accent-text)]" />
									) : null}
								</span>
							</label>
						);
					})}
				</fieldset>
			</div>
		</Overlay>
	);
}

function ConnectorHero({
	definition,
	device,
	instance,
	localFiles,
	isSelected,
	onTry,
}: Pick<ConnectorPanelProps, "definition" | "device" | "instance" | "localFiles" | "onTry"> & {
	isSelected: () => boolean;
}) {
	const { t } = useTranslation();
	const actions = useConnectorActions();

	const [authorizedId, setAuthorizedId] = useState<string>();
	const [waitingForSettings, setWaitingForSettings] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const active = useRef(true);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	const control = definition.id === "computer-control";
	const apple = definition.id.startsWith("apple-");
	const legacy = instance?.scope === "folder";
	const { key, Icon } = connectorPresentation[definition.id];
	const canConfigure = canConfigureConnector(device, definition, localFiles);
	const changed = !instance || legacy || instance.capabilities.fileTools !== control;
	const permission = apple && device.current ? localFiles?.permissionStatus?.(definition.id) : undefined;
	const systemAllowed = permission === "granted" || permission === "limited";
	const systemDenied = permission === "denied" || permission === "restricted";
	const systemUnavailable = permission === "unavailable" || permission === "unsupported";
	const needsSettings =
		systemDenied ||
		(!systemAllowed &&
			(error === "connectors.systemPermissionDenied" || error === "connectors.openSystemSettingsFailed"));
	const authorized = Boolean(authorizedId || (instance && !changed));
	const ready = authorized && isReachable(device, instance) && !needsSettings && !systemUnavailable && !busy;
	const canAuthorize =
		device.status === "online" &&
		!systemUnavailable &&
		canConfigure &&
		(!authorized || needsSettings) &&
		(!needsSettings || !!localFiles?.openPermissionSettings);
	const afterSettings = useEffectEvent(() => void apply(true));
	useEffect(() => {
		if (!waitingForSettings || !systemAllowed || busy) return;
		setWaitingForSettings(false);
		afterSettings();
	}, [waitingForSettings, systemAllowed, busy]);

	async function apply(permissionChecked = systemAllowed) {
		if (!active.current || !isSelected() || !localFiles || !canConfigure || busy) return;
		setBusy(true);
		setError(null);
		let saved: ConnectorInstance | undefined;
		const capabilities = { fileTools: control };
		try {
			if (apple && !permissionChecked) {
				if (!localFiles.prepare) throw new Error("permission_denied");
				await localFiles.prepare(definition.id);
				if (!active.current || !isSelected()) return;
			}
			saved =
				instance && !changed
					? instance
					: instance
						? await actions.update.mutateAsync({
								id: instance.id,
								expectedRevision: instance.revision,
								scope: "device",
								capabilities,
							})
						: await actions.create.mutateAsync({
								connectorId: definition.id,
								deviceId: device.id,
								name: device.name,
								scope: "device",
								capabilities,
							});
			if (!active.current || !isSelected()) throw new Error("cancelled");
			await localFiles.authorize(saved);
			if (!active.current || !isSelected()) throw new Error("cancelled");
			setAuthorizedId(saved.id);
		} catch (failure) {
			if (saved && changed) {
				try {
					if (instance) {
						const restored = await actions.update.mutateAsync({
							id: instance.id,
							expectedRevision: saved.revision,
							scope: instance.scope,
							capabilities: instance.capabilities,
						});
						await localFiles.authorize(restored);
					} else {
						try {
							await actions.remove.mutateAsync(saved.id);
						} finally {
							if (apple) await localFiles.revoke(saved.id, definition.id);
							else await localFiles.revoke(saved.id);
						}
					}
				} catch {
					try {
						if (apple) await localFiles.revoke(saved.id, definition.id);
						else await localFiles.revoke(saved.id);
					} catch {
						/* Keep the incomplete operation visible; never report it as ready. */
					}
				}
			}
			const code = failure instanceof Error ? failure.message : String(failure);
			if (active.current) {
				if (code === "notes_unavailable") setError("connectors.appleNotes.unavailable");
				else if (code === "voice_memos_unavailable") setError("connectors.appleVoiceMemos.unavailable");
				else if (code === "voice_memos_unsupported") setError("connectors.appleVoiceMemos.unsupported");
				else
					setError(
						apple && code === "permission_denied" ? "connectors.systemPermissionDenied" : "connectors.connectFailed",
					);
			}
		} finally {
			setBusy(false);
		}
	}

	async function authorize() {
		if (!needsSettings) return apply();
		if (!localFiles?.openPermissionSettings || busy) return;
		setBusy(true);
		setWaitingForSettings(true);
		try {
			await localFiles.openPermissionSettings(definition.id);
		} catch {
			setWaitingForSettings(false);
			if (active.current) setError("connectors.openSystemSettingsFailed");
		} finally {
			setBusy(false);
		}
	}

	const status = systemUnavailable
		? t("connectors.unavailable")
		: needsSettings
			? t(error === "connectors.openSystemSettingsFailed" ? error : "connectors.sheet.permissionNeeded")
			: error
				? t(error)
				: authorized
					? t(
							!ready
								? "connectors.sheet.pending"
								: permission === "limited"
									? "connectors.sheet.limited"
									: "connectors.sheet.authorized",
						)
					: !canConfigure
						? t("connectors.onDevice", { device: deviceDisplayName(device) })
						: undefined;

	const trial = ready && onTry;
	return (
		<section className="flex flex-col items-center gap-[var(--spacing-3)] rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] px-[var(--spacing-5)] py-[var(--spacing-6)] text-center">
			<span className="grid size-[var(--spacing-12)] place-items-center rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)]">
				<Icon size={26} aria-hidden className="text-[var(--color-text-secondary)]" />
			</span>
			<h3 className="text-h2 font-semibold">{t(`connectors.${key}.name`)}</h3>
			<p className="text-body text-[var(--color-text-secondary)]">{t(`connectors.${key}.description`)}</p>
			{status ? (
				<p role="status" className="text-caption text-[var(--color-text-secondary)]">
					{status}
				</p>
			) : null}
			{!ready || trial ? (
				<Button
					variant="primary"
					size="lg"
					className="rounded-[var(--radius-full)]! px-[var(--spacing-8)]"
					disabled={!trial && !canAuthorize}
					loading={busy}
					onClick={() =>
						trial ? trial(t(`connectors.${key}.trial`, { device: deviceDisplayName(device) })) : void authorize()
					}
				>
					{t(trial ? "connectors.sheet.try" : "connectors.connect")}
				</Button>
			) : null}
		</section>
	);
}
