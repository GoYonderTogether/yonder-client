import type { DeviceSummary } from "@yonder/protocol";
import { Button, TextField } from "@yonder/ui-components";
import { useUpdateDeviceRemark } from "@yonder/ui-data";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

export function DeviceRemarkEditor({ device, onClose }: { device: DeviceSummary; onClose: () => void }) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const update = useUpdateDeviceRemark();
	const formId = useId();
	const [value, setValue] = useState(device.remark ?? "");
	const next = value.trim();
	const tooLong = Array.from(next).length > 80;
	const canSave = !update.isPending && !tooLong && next !== (device.remark ?? "");
	const error = tooLong ? t("me.devices.remarkTooLong") : update.isError ? t("me.devices.remarkFailed") : undefined;
	const cancel = () => {
		if (!update.isPending) onClose();
	};

	return (
		<Overlay
			open
			mode={mode}
			size="small"
			mobilePresentation="sheet"
			closeLabel={t("app.close")}
			title={t("me.devices.editRemark")}
			onClose={cancel}
			footer={
				<>
					<Button variant="secondary" disabled={update.isPending} onClick={cancel}>
						{t("app.cancel")}
					</Button>
					<Button form={formId} type="submit" variant="primary" loading={update.isPending} disabled={!canSave}>
						{t("app.save")}
					</Button>
				</>
			}
		>
			<form
				id={formId}
				className="p-[var(--spacing-5)]"
				onSubmit={(event) => {
					event.preventDefault();
					if (canSave) update.mutate({ deviceId: device.id, remark: next || null }, { onSuccess: onClose });
				}}
			>
				<TextField
					label={t("me.devices.remark")}
					value={value}
					placeholder={device.name}
					hint={t("me.devices.remarkHint")}
					error={error}
					disabled={update.isPending}
					onChange={(event) => {
						setValue(event.target.value);
						if (update.isError) update.reset();
					}}
				/>
			</form>
		</Overlay>
	);
}
