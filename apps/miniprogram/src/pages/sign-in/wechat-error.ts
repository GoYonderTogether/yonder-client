import { t } from "../../lib/i18n";
import { wechatErrorKind } from "./wechat";

export function wechatError(error: unknown): string {
	const kind = wechatErrorKind(error);
	if (kind === "conflict")
		return t(
			"该手机号已绑定其他微信，请使用原微信或手机号登录",
			"This phone is linked to another WeChat account. Use that account or sign in by phone.",
		);
	if (kind === "expired") return t("授权已过期，请重新微信登录", "Authorization expired; sign in with WeChat again");
	return t("微信登录暂不可用，请重试或使用手机号登录", "WeChat sign-in is unavailable. Try again or sign in by phone.");
}

export function authFailure(operation: "send" | "sign-in" | "reset" | "profile"): string {
	switch (operation) {
		case "send":
			return t("验证码发送失败，请稍后重试", "Could not send the verification code. Please try again.");
		case "sign-in":
			return t("登录失败，请检查信息后重试", "Sign-in failed. Check your information and try again.");
		case "reset":
			return t("密码重置失败，请检查信息后重试", "Password reset failed. Check your information and try again.");
		case "profile":
			return t("资料保存失败，请稍后重试", "Could not save your profile. Please try again.");
	}
}
