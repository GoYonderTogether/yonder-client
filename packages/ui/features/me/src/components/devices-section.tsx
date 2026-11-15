import { EmptyState, ListGroup, ListRow } from "@yonder/ui-components";
import { useDevices } from "@yonder/ui-data";
import { Laptop } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DeviceRow } from "./device-row.tsx";

export function DevicesSection({ onAddDevice }: { onAddDevice?: (() => void) | undefined } = {}) {
	const { t } = useTranslation();
	const devices = useDevices();
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
		return <EmptyState icon={<Laptop size={24} strokeWidth={1.6} />} title={t("me.devices.emptyTitle")} />;
	return (
		<ListGroup>
			{devices.data.items.map((device) => (
				<DeviceRow
					key={device.id}
					name={device.name}
					platform={device.platform}
					current={device.current}
					status={device.status}
				/>
			))}
			{onAddDevice ? <ListRow title={t("me.devices.add")} chevron onClick={onAddDevice} /> : null}
		</ListGroup>
	);
}
