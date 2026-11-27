import type { DeviceSummary } from "@yonder/protocol";
import { useSignOutDevice } from "@yonder/ui-data";
import { ConfirmDialog } from "@yonder/ui-shell";
import { useTranslation } from "react-i18next";
import { deviceDisplayName } from "./device-display-name.ts";

export function DeviceSignOutDialog({ device, onClose }: { device: DeviceSummary; onClose: () => void }) {
	const { t } = useTranslation();
	const signOut = useSignOutDevice();
	return (
		<ConfirmDialog
			open
			title={t("me.devices.signOutTitle", { device: deviceDisplayName(device) })}
			body={
				<span className="wrap-anywhere">
					{t(device.current ? "me.devices.signOutCurrentBody" : "me.devices.signOutBody", {
						device: deviceDisplayName(device),
					})}
				</span>
			}
			confirmLabel={t("me.devices.signOut")}
			cancelLabel={t("app.cancel")}
			closeLabel={t("app.close")}
			backLabel={t("app.back")}
			busy={signOut.isPending}
			error={signOut.isError ? t("me.devices.signOutFailed") : null}
			onCancel={() => {
				if (!signOut.isPending) onClose();
			}}
			onConfirm={() => signOut.mutate(device.id, { onSuccess: onClose })}
		/>
	);
}
