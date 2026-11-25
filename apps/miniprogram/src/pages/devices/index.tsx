import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { DeviceSummary } from "@yonder/protocol";
import { formatInstant } from "@yonder/ui-time";
import { useState } from "react";
import { action, Button, Field, Page, Row, State } from "../../components/ui";
import { useResource } from "../../components/use-resource";
import { currentLocale, t } from "../../lib/i18n";
import { api, useSession } from "../../lib/runtime";
import { accountTimeZone } from "../../lib/time";

export default function Devices() {
	const { signOut } = useSession();
	const [editingId, setEditingId] = useState<string | null>(null);
	const { data, loading, error, reload } = useResource(async () => ({
		devices: await api.devices(),
		sessions: await api.sessions(),
	}));
	const editing = data?.devices.items.find((device) => device.id === editingId);
	return (
		<Page title={t("设备与会话", "Devices & sessions")}>
			<State loading={loading} error={error} retry={() => void reload()} />
			<View className="mini-card">
				<Text className="mini-subtitle">{t("设备", "Devices")}</Text>
				{data?.devices.items.map((device) => {
					const name = device.remark?.trim() || device.name;
					return (
						<View key={device.id}>
							<Row
								title={name}
								detail={`${name === device.name ? "" : `${device.name} · `}${device.platform} · ${device.status === "online" ? t("在线", "Online") : t("离线", "Offline")}${device.current ? ` · ${t("当前设备", "This device")}` : ""}`}
								onClick={editing ? undefined : () => setEditingId(device.id)}
							/>
							{editingId === device.id ? (
								<DeviceRemarkEditor device={device} onSaved={reload} onClose={() => setEditingId(null)} />
							) : null}
						</View>
					);
				})}
			</View>
			<View className="mini-card">
				<Text className="mini-subtitle">{t("登录会话", "Sign-in sessions")}</Text>
				{data?.sessions.items.map((session) => {
					const device = data.devices.items.find((item) => item.id === session.deviceId);
					return (
						<View key={session.id}>
							<Row
								title={device?.remark?.trim() || device?.name || session.deviceName}
								detail={`${session.platform} · ${formatInstant(session.lastSeenAt, { zone: accountTimeZone(), locale: currentLocale(), style: "dateTime", width: "short", year: "always" })}`}
							/>
							<Button
								secondary
								onClick={() =>
									void action(async () => {
										const result = await Taro.showModal({
											title: t("退出此会话？", "Sign out this session?"),
											confirmText: t("确认", "Confirm"),
											cancelText: t("取消", "Cancel"),
										});
										if (!result.confirm) return;
										if (session.current) await signOut();
										else {
											await api.revokeSession(session.id);
											await reload();
										}
									})
								}
							>
								{session.current ? t("退出当前设备", "Sign out this device") : t("退出此设备", "Sign out device")}
							</Button>
						</View>
					);
				})}
			</View>
		</Page>
	);
}

function DeviceRemarkEditor({
	device,
	onSaved,
	onClose,
}: {
	device: DeviceSummary;
	onSaved: () => Promise<void>;
	onClose: () => void;
}) {
	const [value, setValue] = useState(device.remark ?? "");
	const [saving, setSaving] = useState(false);
	const [failed, setFailed] = useState(false);
	const next = value.trim();
	const tooLong = Array.from(next).length > 80;
	const canSave = !saving && !tooLong && next !== (device.remark ?? "");

	async function save() {
		if (!canSave) return;
		setSaving(true);
		setFailed(false);
		try {
			await api.updateDeviceRemark(device.id, { remark: next || null });
			await onSaved();
			onClose();
		} catch {
			setFailed(true);
		} finally {
			setSaving(false);
		}
	}

	return (
		<View>
			<Field
				label={t("设备备注", "Device remark")}
				value={value}
				placeholder={device.name}
				maxlength={-1}
				onInput={(input) => {
					setValue(input);
					setFailed(false);
				}}
			/>
			<Text className={tooLong || failed ? "mini-error" : "mini-muted"}>
				{tooLong
					? t("备注最多 80 个字。", "Use at most 80 characters.")
					: failed
						? t("备注保存失败，请重试。", "Could not save the remark. Try again.")
						: t("留空时使用系统设备名。", "Leave blank to use the system device name.")}
			</Text>
			<Button loading={saving} disabled={!canSave} onClick={() => void save()}>
				{t("保存", "Save")}
			</Button>
			<Button secondary disabled={saving} onClick={onClose}>
				{t("取消", "Cancel")}
			</Button>
		</View>
	);
}
