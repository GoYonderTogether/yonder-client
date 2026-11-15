import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { action, Button, Page, Row, State } from "../../components/ui";
import { useResource } from "../../components/use-resource";
import { t } from "../../lib/i18n";
import { api, useSession } from "../../lib/runtime";

export default function Devices() {
	const { signOut } = useSession();
	const { data, loading, error, reload } = useResource(async () => ({
		devices: await api.devices(),
		sessions: await api.sessions(),
	}));
	return (
		<Page title={t("设备与会话", "Devices & sessions")}>
			<State loading={loading} error={error} retry={() => void reload()} />
			<View className="mini-card">
				<Text className="mini-subtitle">{t("设备", "Devices")}</Text>
				{data?.devices.items.map((device) => (
					<Row
						key={device.id}
						title={device.name}
						detail={`${device.platform} · ${device.status === "online" ? t("在线", "Online") : t("离线", "Offline")}${device.current ? ` · ${t("当前设备", "This device")}` : ""}`}
					/>
				))}
			</View>
			<View className="mini-card">
				<Text className="mini-subtitle">{t("登录会话", "Sign-in sessions")}</Text>
				{data?.sessions.items.map((session) => (
					<View key={session.id}>
						<Row
							title={session.deviceName}
							detail={`${session.platform} · ${new Date(session.lastSeenAt).toLocaleString()}`}
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
				))}
			</View>
		</Page>
	);
}
