import { Checkbox, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { t } from "../../lib/i18n";

export function Consent({ agree, onChange }: { agree: boolean; onChange: (value: boolean) => void }) {
	return (
		<View className="mini-auth-consent">
			<View className="mini-auth-check-wrap">
				<View className={`auth-check ${agree ? "auth-check-checked" : ""}`} ariaHidden>
					{agree ? "✓" : ""}
				</View>
				<Checkbox
					className="mini-auth-checkbox"
					value="agreeTerms"
					checked={agree}
					onClick={() => onChange(!agree)}
					ariaLabel={t("同意协议", "Agree to terms")}
				/>
			</View>
			<View className="mini-auth-consent-text">
				<Text onClick={() => onChange(!agree)}>{t("我已阅读并同意", "I agree to the ")}</Text>
				<Text className="mini-auth-link" onClick={() => void Taro.navigateTo({ url: "/pages/legal/index?kind=terms" })}>
					{t("用户协议", "Terms")}
				</Text>
				<Text>{t("和", " and ")}</Text>
				<Text
					className="mini-auth-link"
					onClick={() => void Taro.navigateTo({ url: "/pages/legal/index?kind=privacy" })}
				>
					{t("隐私政策", "Privacy")}
				</Text>
			</View>
		</View>
	);
}
