import type { DeviceSummary } from "@yonder/protocol";
import { Button, EmptyState, IconButton, ListGroup, ListRow } from "@yonder/ui-components";
import { useDevices } from "@yonder/ui-data";
import { Laptop, Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceDisplayName } from "./device-display-name.ts";
import { DeviceRemarkEditor } from "./device-remark-editor.tsx";
import { DeviceRow } from "./device-row.tsx";
import { DeviceSignOutDialog } from "./device-sign-out-dialog.tsx";

export function DevicesSection({ onAddDevice }: { onAddDevice?: (() => void) | undefined } = {}) {
	const { t } = useTranslation();
	const devices = useDevices();
	const [action, setAction] = useState<{ kind: "edit" | "sign-out"; device: DeviceSummary } | null>(null);
	const editing = action?.kind === "edit" ? devices.data?.items.find(({ id }) => id === action.device.id) : undefined;
	if (devices.isLoading)
		return (
			<ListGroup>
				<ListRow title={t("app.loading")} disabled className="hover:bg-transparent" />
			</ListGroup>
		);
	if (devices.isError && !devices.data)
		return (
			<ListGroup>
				<ListRow title={t("me.devices.loadFailed")} trailing={t("app.retry")} onClick={() => void devices.refetch()} />
			</ListGroup>
		);
	const groups = new Map<DeviceSummary["platform"], DeviceSummary[]>();
	for (const device of devices.data?.items ?? []) {
		const group = groups.get(device.platform) ?? [];
		if (device.current) group.unshift(device);
		else group.push(device);
		groups.set(device.platform, group);
	}
	const platformGroups = [...groups].sort(([a], [b]) => Number(a === "web") - Number(b === "web"));
	const close = () => setAction(null);
	return (
		<div className="flex flex-col gap-[var(--spacing-3)]">
			{platformGroups.map(([platform, items]) => (
				<ListGroup key={platform} title={t(`me.devices.platforms.${platform}`, { defaultValue: platform })}>
					{items.map((device) => {
						const name = deviceDisplayName(device);
						return (
							<DeviceRow
								key={device.id}
								name={name}
								systemName={name === device.name ? undefined : device.name}
								platform={device.platform}
								showPlatform={false}
								current={device.current}
								status={device.status}
							>
								<IconButton
									aria-haspopup="dialog"
									aria-label={t("me.devices.editRemarkFor", { device: name })}
									title={t("me.devices.editRemark")}
									className="shrink-0"
									onClick={() => setAction({ kind: "edit", device })}
								>
									<Pencil size={16} aria-hidden="true" />
								</IconButton>
								<Button
									variant="ghost"
									size="sm"
									aria-haspopup="dialog"
									aria-label={t("me.devices.signOutFor", { device: name })}
									className="shrink-0 whitespace-nowrap"
									onClick={() => setAction({ kind: "sign-out", device })}
								>
									{t("me.devices.signOut")}
								</Button>
							</DeviceRow>
						);
					})}
				</ListGroup>
			))}
			{groups.size === 0 ? (
				<EmptyState
					icon={<Laptop size={24} strokeWidth={1.6} />}
					title={t("me.devices.emptyTitle")}
					action={
						onAddDevice ? (
							<Button variant="primary" onClick={onAddDevice}>
								{t("me.devices.add")}
							</Button>
						) : undefined
					}
				/>
			) : onAddDevice ? (
				<ListGroup>
					<ListRow title={t("me.devices.add")} chevron onClick={onAddDevice} />
				</ListGroup>
			) : null}
			{editing ? <DeviceRemarkEditor key={editing.id} device={editing} onClose={close} /> : null}
			{action?.kind === "sign-out" ? <DeviceSignOutDialog device={action.device} onClose={close} /> : null}
		</div>
	);
}
