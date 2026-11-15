import { Text, View } from "@tarojs/components";
import Taro, { useShareAppMessage } from "@tarojs/taro";
import { action, Button, Page, Row, State } from "../../components/ui";
import { useResource } from "../../components/use-resource";
import { t } from "../../lib/i18n";
import { api } from "../../lib/runtime";

export default function Invite() {
	const { data, loading, error, reload } = useResource(() => api.invite());
	useShareAppMessage(() => ({
		title: t("和我一起使用 Yonder", "Join me on Yonder"),
		path: `/pages/sign-in/index?invite=${encodeURIComponent(data?.code || "")}`,
	}));
	return (
		<Page title={t("邀请朋友", "Invite friends")}>
			<State loading={loading} error={error} retry={() => void reload()} />
			{data && (
				<View className="mini-card">
					<Text className="mini-muted">{t("邀请码", "Invite code")}</Text>
					<Button share>{t("分享给微信朋友", "Share with WeChat friends")}</Button>
					<Text className="mini-title" selectable>
						{data.code}
					</Text>
					<Row title={t("已邀请", "Invited")} detail={String(data.stats.invitedCount)} />
					<Row title={t("获得奖励", "Rewards received")} detail={String(data.stats.grantedTotal)} />
					<Row title={t("新用户奖励", "New member reward")} detail={String(data.rewardRule.newUserGets)} />
					<Button onClick={() => void action(() => Taro.setClipboardData({ data: data.link }))}>
						{t("复制邀请链接", "Copy invite link")}
					</Button>
					<Button secondary onClick={() => void action(() => Taro.setClipboardData({ data: data.code }))}>
						{t("复制邀请码", "Copy invite code")}
					</Button>
				</View>
			)}
		</Page>
	);
}
