import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { action, Button, Field, Page, Row } from "../../components/ui";
import { t } from "../../lib/i18n";
import { api, useSession } from "../../lib/runtime";

export default function Account() {
	const { me, refreshMe, signOut } = useSession();
	const [old, setOld] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [busy, setBusy] = useState(false);
	return (
		<Page title={t("账号与安全", "Account & security")}>
			<View className="mini-card">
				{me?.signInMethods.map((method) => (
					<Row key={method.masked} title={t("手机号", "Phone")} detail={method.masked} />
				))}
				{me?.hasPassword && <Field label={t("当前密码", "Current password")} value={old} onInput={setOld} password />}
				<Field label={t("新密码", "New password")} value={password} onInput={setPassword} password />
				<Button
					disabled={password.length < 8 || Boolean(me?.hasPassword && !old)}
					loading={busy}
					onClick={() =>
						void action(async () => {
							setBusy(true);
							try {
								await api.setPassword({ newPassword: password, ...(me?.hasPassword ? { currentPassword: old } : {}) });
								await refreshMe();
								setOld("");
								setPassword("");
								void Taro.showToast({ title: t("已保存", "Saved"), icon: "success" });
							} finally {
								setBusy(false);
							}
						})
					}
				>
					{t("保存密码", "Save password")}
				</Button>
			</View>
			<View className="mini-card">
				<Field
					label={t("输入你的 Yonder 号确认注销", "Enter your Yonder handle to delete account")}
					value={confirm}
					onInput={setConfirm}
				/>
				<Button
					danger
					disabled={!me || confirm !== me.member.handle}
					onClick={() =>
						void action(async () => {
							const result = await Taro.showModal({
								title: t("注销账号", "Delete account"),
								content: t("账号将进入注销流程，确认继续？", "Your account will be scheduled for deletion. Continue?"),
								confirmText: t("确认", "Confirm"),
								cancelText: t("取消", "Cancel"),
							});
							if (result.confirm) {
								await api.deleteAccount({ confirmHandle: confirm });
								await signOut();
							}
						})
					}
				>
					{t("注销账号", "Delete account")}
				</Button>
			</View>
		</Page>
	);
}
