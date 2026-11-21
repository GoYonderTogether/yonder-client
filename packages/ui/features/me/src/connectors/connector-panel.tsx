import type { ConnectorDefinition, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { useConnectorActions } from "@yonder/ui-data";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceDisplayName } from "../components/device-display-name.ts";
import { connectorPresentation } from "./connector-card.tsx";
import { canConfigureConnector, type LocalFilesAdapter } from "./local-files-adapter.ts";

export interface ConnectorPanelProps {
	definition: ConnectorDefinition;
	device: DeviceSummary;
	instance?: ConnectorInstance | undefined;
	localFiles?: LocalFilesAdapter | undefined;
	connect?: boolean | undefined;
	onOpenDevices?: (() => void) | undefined;
	onClose: () => void;
}

export function ConnectorPanel({
	definition,
	device,
	instance,
	localFiles,
	connect,
	onOpenDevices,
	onClose,
}: ConnectorPanelProps) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const actions = useConnectorActions();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const active = useRef(true);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	const close = () => {
		active.current = false;
		onClose();
	};
	const control = definition.id === "computer-control";
	const apple = definition.id.startsWith("apple-");
	const legacy = instance?.scope === "folder";
	const { key, Icon } = connectorPresentation[definition.id];
	const canConfigure = canConfigureConnector(device, definition, localFiles);
	const changed = !instance || legacy || instance.capabilities.fileTools !== control;
	const repair = apple && instance?.status === "offline" && canConfigure;
	const permissionError =
		error === "connectors.systemPermissionDenied" || error === "connectors.openSystemSettingsFailed";
	const errorMessage =
		error === "connectors.systemPermissionDenied" && device.platform === "ios" && definition.id === "apple-calendar"
			? "connectors.appleCalendar.iosPermissionDenied"
			: error;
	const startOnce = useRef(false);
	const start = useEffectEvent(() => void apply());
	useEffect(() => {
		if (!connect || !canConfigure || startOnce.current) return;
		startOnce.current = true;
		start();
	}, [connect, canConfigure]);

	async function apply() {
		if (!device || !localFiles || !canConfigure) return;
		setBusy(true);
		setError(null);
		let saved: ConnectorInstance | undefined;
		const capabilities = { fileTools: control };
		try {
			if (apple) {
				if (!localFiles.prepare) throw new Error("permission_denied");
				await localFiles.prepare(definition.id);
				if (!active.current) return;
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
			if (!active.current) throw new Error("cancelled");
			await localFiles.authorize(saved);
			if (!active.current) throw new Error("cancelled");
			close();
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

	async function openPermissionSettings() {
		try {
			await localFiles?.openPermissionSettings?.(definition.id);
		} catch {
			if (active.current) setError("connectors.openSystemSettingsFailed");
		}
	}

	async function disconnect() {
		if (!instance) return;
		setBusy(true);
		setError(null);
		try {
			if (apple && instance.currentDevice) await localFiles?.revoke(instance.id, definition.id);
			try {
				await actions.remove.mutateAsync(instance.id);
			} finally {
				if (!apple && instance.currentDevice && localFiles?.supported) await localFiles.revoke(instance.id);
			}
			close();
		} catch {
			if (active.current) setError("connectors.disconnectFailed");
		} finally {
			setBusy(false);
		}
	}
	return (
		<Overlay
			open
			title={t(`connectors.${key}.name`)}
			mode={mode}
			mobilePresentation="sheet"
			closeLabel={t("app.close")}
			onClose={close}
		>
			<div className="flex flex-col gap-[var(--spacing-5)] p-[var(--spacing-5)]">
				<div className="flex items-center gap-[var(--spacing-3)]">
					<Icon size={28} aria-hidden className="shrink-0 text-[var(--color-text-secondary)]" />
					<p className="text-body text-[var(--color-text-secondary)]">{t(`connectors.${key}.description`)}</p>
				</div>
				<p className="break-words text-body">
					{deviceDisplayName(device)}
					{legacy ? ` · ${instance.name}` : ""}
					{(instance?.currentDevice ?? device.current) ? ` · ${t("me.account.sessionCurrent")}` : ""}
				</p>
				{legacy ? <p className="text-body text-[var(--color-text-secondary)]">{t("connectors.legacyScope")}</p> : null}
				<details className="text-caption text-[var(--color-text-secondary)]">
					<summary className="cursor-pointer">{t("connectors.usage")}</summary>
					<p className="pt-[var(--spacing-3)]">{t("connectors.usageBody")}</p>
				</details>
				{!canConfigure && changed ? (
					<p className="text-caption text-[var(--color-text-secondary)]">
						{t("connectors.onDevice", { device: deviceDisplayName(device) })}
					</p>
				) : null}
				{errorMessage ? (
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{t(errorMessage)}
					</p>
				) : null}
				{canConfigure && apple && localFiles?.openPermissionSettings && permissionError ? (
					<Button variant="ghost" disabled={busy} onClick={() => void openPermissionSettings()}>
						{t("connectors.openSystemSettings")}
					</Button>
				) : null}
				<p className="text-caption text-[var(--color-text-secondary)]">
					{t(apple ? `connectors.${key}.scope` : control ? "connectors.fileToolsScope" : "connectors.readScope")}
				</p>
				{canConfigure && (changed || repair) ? (
					<Button variant="primary" loading={busy} onClick={() => void apply()}>
						{t(
							permissionError
								? "connectors.retryConnect"
								: repair
									? "connectors.reauthorize"
									: apple
										? "connectors.connect"
										: legacy
											? "connectors.upgrade"
											: instance
												? "connectors.save"
												: "connectors.enable",
						)}
					</Button>
				) : null}
				{instance ? (
					<Button variant="danger" loading={busy} onClick={() => void disconnect()}>
						{t("connectors.disconnect")}
					</Button>
				) : !canConfigure && onOpenDevices ? (
					<Button
						variant="primary"
						onClick={() => {
							close();
							onOpenDevices();
						}}
					>
						{t("connectors.viewDevices")}
					</Button>
				) : null}
			</div>
		</Overlay>
	);
}
