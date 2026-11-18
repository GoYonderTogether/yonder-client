import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { action, Button, Field, Page, Row } from "../../components/ui";
import { t } from "../../lib/i18n";
import { api, useSession } from "../../lib/runtime";
import { DeleteAccount } from "./delete-account";
import { accountFailure } from "./failure";

export default function Account() {
	const { me, refreshMe, signOut } = useSession();
	const [old, setOld] = useState("");
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	return (
		<Page title={t("账号与安全", "Account & security")}>
			<View className="mini-card">
				{me?.signInMethods.map((method) =>
					method.channel === "sms" ? (
						<Row key="sms" title={t("手机号", "Phone")} detail={method.masked} />
					) : (
						<Row key="wechat" title={t("微信（小程序）", "WeChat (mini program)")} detail={t("已绑定", "Linked")} />
					),
				)}
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
			<DeleteAccount
				handle={me?.member.handle ?? ""}
				sendCode={async () => (await api.sendDeleteAccountCode()).maskedTarget}
				confirm={async (input) => {
					await api.deleteAccount(input);
					await signOut();
				}}
				onError={(error) => void Taro.showToast({ title: accountFailure(error), icon: "none" })}
			/>
		</Page>
	);
}
