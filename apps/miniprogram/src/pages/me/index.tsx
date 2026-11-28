import { View } from "@tarojs/components";
import { RemoteAvatar } from "../../components/remote-avatar";
import { action, Button, go, Page, Row } from "../../components/ui";
import { t, useLocale } from "../../lib/i18n";
import { api, useSession } from "../../lib/runtime";

export default function Me() {
	const { me, signOut } = useSession();
	const { locale, setLocale } = useLocale();
	return (
		<Page title={t("我", "Me")}>
			<View className="mini-card">
				{me?.member.avatarUrl && <RemoteAvatar src={me.member.avatarUrl} />}
				<Row title={me?.member.displayName || ""} detail={me?.member.handle} onClick={() => go("profile")} />
			</View>
			<View className="mini-card">
				{[
					["bots", t("Bot", "Bots")],
					["contacts", t("联系人", "Contacts")],
					["models", t("模型", "Models")],
					["skills", t("技能", "Skills")],
					["quota", t("额度与用量", "Quota & usage")],
					["devices", t("设备与登录会话", "Devices & sessions")],
					["invite", t("邀请朋友", "Invite friends")],
					["privacy", t("账号隐私", "Account privacy")],
					["account", t("账号与安全", "Account & security")],
				].map(([page, label]) => (
					<Row key={page} title={label} onClick={() => go(page)} />
				))}
			</View>
			<View className="mini-card">
				<Row
					title={t("语言", "Language")}
					detail={locale === "en" ? "English" : "简体中文"}
					onClick={() => {
						const next = locale === "en" ? "zh-CN" : "en";
						setLocale(next);
						void action(() => api.updateMe({ settings: { locale: next } }));
					}}
				/>
				<Row title={t("隐私政策", "Privacy policy")} onClick={() => go("/pages/legal/index?kind=privacy")} />
				<Row title={t("用户协议", "Terms of service")} onClick={() => go("/pages/legal/index?kind=terms")} />
			</View>
			<Button secondary onClick={() => void action(signOut)}>
				{t("退出登录", "Sign out")}
			</Button>
		</Page>
	);
}
