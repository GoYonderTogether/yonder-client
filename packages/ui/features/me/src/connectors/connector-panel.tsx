import type { ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { Button, ListGroup } from "@yonder/ui-components";
import { useConnectorActions } from "@yonder/ui-data";
import { ConfirmDialog, Overlay, useShellChrome } from "@yonder/ui-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceDisplayName } from "../components/device-display-name.ts";
import { DeviceSwitches } from "./connector-device-switches.tsx";
import { type ConnectorGroup, groupKey, TERMINAL_MEMBER } from "./connector-groups.ts";
import type { LocalFilesAdapter } from "./local-files-adapter.ts";

export interface ConnectorPanelProps {
	group: ConnectorGroup;
	/** Every device that can take at least one member of the group, the one opened from first. */
	devices: readonly DeviceSummary[];
	instances: readonly ConnectorInstance[];
	localFiles?: LocalFilesAdapter | undefined;
	onTry?: ((draft: string) => void) | undefined;
	/** Refetch devices and grants, for the retry mark on a dropped device. */
	onRetry?: (() => void) | undefined;
	onClose: () => void;
}

/**
 * What one connector does and where it is on: a sentence, then one entry per device with its
 * switches (docs/settings-forms.md). The switch is the grant, closing one device only removes that
 * device's grant, and "close on all devices" removes every grant of the connector after a
 * confirmation. A device with nothing granted also carries a connect button; "try it" names the
 * device when several are ready and says why it is unavailable when none is.
 */
export function ConnectorPanel({
	group,
	devices,
	instances,
	localFiles,
	onTry,
	onRetry,
	onClose,
}: ConnectorPanelProps) {
	const { t } = useTranslation();
	const actions = useConnectorActions();
	const [confirmClose, setConfirmClose] = useState(false);
	const [closing, setClosing] = useState(false);
	const [closeError, setCloseError] = useState(false);
	const { mode } = useShellChrome();
	const key = groupKey(group);
	const grants = instances.filter(
		(item) => item.scope === "device" && group.members.some((member) => member.id === item.connectorId),
	);
	const readyDevices = devices.filter(
		(device) =>
			device.status === "online" &&
			instances.some(
				(item) =>
					item.deviceId === device.id &&
					item.scope === "device" &&
					item.status === "online" &&
					group.members.some((member) => member.id !== TERMINAL_MEMBER && member.id === item.connectorId),
			),
	);

	async function closeAll() {
		setClosing(true);
		setCloseError(false);
		try {
			const results = await Promise.allSettled(
				grants.map(async (grant) => {
					const device = devices.find((item) => item.id === grant.deviceId);
					const local =
						device?.current && localFiles
							? localFiles.revoke(grant.id, grant.connectorId).catch(() => {})
							: Promise.resolve();
					await Promise.all([local, actions.remove.mutateAsync(grant.id)]);
				}),
			);
			if (results.some((result) => result.status === "rejected")) throw new Error("close_failed");
			setConfirmClose(false);
		} catch {
			setCloseError(true);
		} finally {
			setClosing(false);
		}
	}
	return (
		<Overlay
			open
			title={t(`connectors.${key}.name`)}
			mode={mode}
			mobilePresentation="large-sheet"
			closeLabel={t("app.close")}
			onClose={onClose}
		>
			<div className="flex flex-col gap-[var(--spacing-5)] p-[var(--spacing-4)]">
				<p className="text-body text-[var(--color-text-secondary)]">{t(`connectors.${key}.description`)}</p>
				<ListGroup title={t("connectors.sheet.devices")}>
					{devices.map((device, index) => (
						<DeviceSwitches
							key={device.id}
							members={group.members}
							device={device}
							instances={instances.filter((item) => item.deviceId === device.id)}
							localFiles={localFiles}
							onRetry={onRetry}
							connectButton={index === 0}
						/>
					))}
				</ListGroup>
				{onTry && grants.length ? (
					readyDevices.length ? (
						<div className="flex flex-col gap-[var(--spacing-2)]">
							{readyDevices.map((device) => (
								<Button
									key={device.id}
									variant="primary"
									size="lg"
									className="rounded-[var(--radius-full)]!"
									onClick={() => {
										onClose();
										onTry(t(`connectors.${key}.trial`, { device: deviceDisplayName(device) }));
									}}
								>
									{readyDevices.length > 1
										? t("connectors.sheet.tryOn", { device: deviceDisplayName(device) })
										: t("connectors.sheet.try")}
								</Button>
							))}
						</div>
					) : (
						<div className="flex flex-col gap-[var(--spacing-2)]">
							<Button variant="primary" size="lg" className="rounded-[var(--radius-full)]!" disabled>
								{t("connectors.sheet.try")}
							</Button>
							<p className="text-center text-caption text-[var(--color-text-tertiary)]">
								{t("connectors.sheet.tryOffline")}
							</p>
						</div>
					)
				) : null}
				{grants.length ? (
					<Button
						variant="danger"
						onClick={() => {
							setCloseError(false);
							setConfirmClose(true);
						}}
					>
						{t("connectors.sheet.closeAll")}
					</Button>
				) : null}
			</div>
			<ConfirmDialog
				open={confirmClose}
				title={t("connectors.sheet.closeAllTitle")}
				body={t("connectors.sheet.closeAllBody")}
				confirmLabel={t("connectors.sheet.closeAllConfirm")}
				cancelLabel={t("app.cancel")}
				closeLabel={t("app.close")}
				backLabel={t("app.back")}
				busy={closing}
				error={closeError ? t("connectors.sheet.closeAllFailed") : null}
				onConfirm={() => void closeAll()}
				onCancel={() => setConfirmClose(false)}
			/>
		</Overlay>
	);
}
