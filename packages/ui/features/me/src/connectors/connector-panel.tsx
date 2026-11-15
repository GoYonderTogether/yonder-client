import type { ConnectorDefinition, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { useConnectorActions } from "@yonder/ui-data";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { FolderSearch, MonitorCog } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LocalFilesAdapter } from "./local-files-adapter.ts";

export interface ConnectorPanelProps {
	definition: ConnectorDefinition;
	device: DeviceSummary;
	instance?: ConnectorInstance | undefined;
	localFiles?: LocalFilesAdapter | undefined;
	onOpenDevices?: (() => void) | undefined;
	onClose: () => void;
}

export function ConnectorPanel({
	definition,
	device,
	instance,
	localFiles,
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
	const legacy = instance?.scope === "folder";
	const key = control ? "computerControl" : "localFiles";
	const Icon = control ? MonitorCog : FolderSearch;
	const canConfigure = device.current && localFiles?.supported && definition.platforms.includes(device.platform);
	const changed = !instance || legacy || instance.capabilities.fileTools !== control;

	async function apply() {
		if (!device || !localFiles || !canConfigure) return;
		setBusy(true);
		setError(null);
		let saved: ConnectorInstance | undefined;
		const capabilities = { fileTools: control };
		try {
			saved = instance
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
		} catch {
			if (saved) {
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
							await localFiles.revoke(saved.id);
						}
					}
				} catch {
					try {
						await localFiles.revoke(saved.id);
					} catch {
						/* Keep the incomplete operation visible; never report it as ready. */
					}
				}
			}
			if (active.current) setError(t("connectors.connectFailed"));
		} finally {
			setBusy(false);
		}
	}
	async function disconnect() {
		if (!instance) return;
		setBusy(true);
		setError(null);
		try {
			try {
				await actions.remove.mutateAsync(instance.id);
			} finally {
				if (instance.currentDevice && localFiles?.supported) await localFiles.revoke(instance.id);
			}
			close();
		} catch {
			if (active.current) setError(t("connectors.disconnectFailed"));
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
				{instance ? (
					<p className="break-words text-body">
						{instance.deviceName}
						{legacy ? ` · ${instance.name}` : ""}
						{instance.currentDevice ? ` · ${t("me.account.sessionCurrent")}` : ""}
					</p>
				) : (
					<p className="text-body">
						{device.name}
						{device.current ? ` · ${t("me.account.sessionCurrent")}` : ""}
					</p>
				)}
				{legacy ? <p className="text-body text-[var(--color-text-secondary)]">{t("connectors.legacyScope")}</p> : null}
				<details className="text-caption text-[var(--color-text-secondary)]">
					<summary className="cursor-pointer">{t("connectors.usage")}</summary>
					<p className="pt-[var(--spacing-3)]">{t("connectors.usageBody")}</p>
				</details>
				{!canConfigure && changed ? (
					<p className="text-caption text-[var(--color-text-secondary)]">
						{t(device ? "connectors.onDevice" : "connectors.needsDesktop", { device: device?.name })}
					</p>
				) : null}
				{error ? (
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{error}
					</p>
				) : null}
				<p className="text-caption text-[var(--color-text-secondary)]">
					{t(control ? "connectors.fileToolsScope" : "connectors.readScope")}
				</p>
				{canConfigure && changed ? (
					<Button variant="primary" loading={busy} onClick={() => void apply()}>
						{t(legacy ? "connectors.upgrade" : instance ? "connectors.save" : "connectors.enable")}
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
