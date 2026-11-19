import { Button, EmptyState, IconButton, ListGroup, ListRow } from "@yonder/ui-components";
import { useDevices } from "@yonder/ui-data";
import { Laptop, Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceDisplayName } from "./device-display-name.ts";
import { DeviceRemarkEditor } from "./device-remark-editor.tsx";
import { DeviceRow } from "./device-row.tsx";

export function DevicesSection({ onAddDevice }: { onAddDevice?: (() => void) | undefined } = {}) {
	const { t } = useTranslation();
	const devices = useDevices();
	const [editingId, setEditingId] = useState<string | null>(null);
	const editing = devices.data?.items.find((device) => device.id === editingId);
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
	if (!devices.data?.items.length)
		return (
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
		);
	return (
		<>
			<ListGroup>
				{devices.data.items.map((device) => {
					const name = deviceDisplayName(device);
					return (
						<DeviceRow
							key={device.id}
							name={name}
							systemName={name === device.name ? undefined : device.name}
							platform={device.platform}
							current={device.current}
							status={device.status}
						>
							<IconButton
								aria-haspopup="dialog"
								aria-label={t("me.devices.editRemarkFor", { device: name })}
								title={t("me.devices.editRemark")}
								onClick={() => setEditingId(device.id)}
							>
								<Pencil size={16} aria-hidden="true" />
							</IconButton>
						</DeviceRow>
					);
				})}
				{onAddDevice ? <ListRow title={t("me.devices.add")} chevron onClick={onAddDevice} /> : null}
			</ListGroup>
			{editing ? <DeviceRemarkEditor key={editing.id} device={editing} onClose={() => setEditingId(null)} /> : null}
		</>
	);
}
