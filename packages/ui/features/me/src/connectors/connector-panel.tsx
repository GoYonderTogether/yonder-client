import type { ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { Button, ListGroup } from "@yonder/ui-components";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
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
	onClose: () => void;
}

/**
 * What one connector does and where it is on: a sentence, then one entry per device with its
 * switches (docs/settings-forms.md). The switch is the grant; there is no separate connect button,
 * no disconnect button and no device picker.
 */
export function ConnectorPanel({ group, devices, instances, localFiles, onTry, onClose }: ConnectorPanelProps) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const key = groupKey(group);
	const ready = devices.find(
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
					{devices.map((device) => (
						<DeviceSwitches
							key={device.id}
							members={group.members}
							device={device}
							instances={instances.filter((item) => item.deviceId === device.id)}
							localFiles={localFiles}
						/>
					))}
				</ListGroup>
				{ready && onTry ? (
					<Button
						variant="primary"
						size="lg"
						className="rounded-[var(--radius-full)]!"
						onClick={() => {
							onClose();
							onTry(t(`connectors.${key}.trial`, { device: deviceDisplayName(ready) }));
						}}
					>
						{t("connectors.sheet.try")}
					</Button>
				) : null}
			</div>
		</Overlay>
	);
}
