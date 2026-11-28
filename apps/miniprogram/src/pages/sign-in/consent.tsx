import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { t } from "../../lib/i18n";

export function Consent() {
	return (
		<View className="mini-auth-consent">
			<Text>{t("登录或注册即同意", "By signing in or signing up, you agree to the ")}</Text>
			<Text
				className="mini-auth-link"
				ariaRole="link"
				onClick={() => void Taro.navigateTo({ url: "/pages/legal/index?kind=terms" })}
			>
				{t("用户协议", "Terms of Service")}
			</Text>
			<Text>{t("和", " and ")}</Text>
			<Text
				className="mini-auth-link"
				ariaRole="link"
				onClick={() => void Taro.navigateTo({ url: "/pages/legal/index?kind=privacy" })}
			>
				{t("隐私政策", "Privacy Policy")}
			</Text>
			<Text>{t("。", ".")}</Text>
		</View>
	);
}
