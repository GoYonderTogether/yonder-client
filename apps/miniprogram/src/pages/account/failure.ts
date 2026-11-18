import { ApiError } from "@yonder/api-client";
import { t } from "../../lib/i18n";

/**
 * The sentence for a failed account action. The server's own `message` is for developers; what the
 * person reads is chosen by the error code, and a failure the code does not explain says so
 * instead of blaming the handle.
 */
export function accountFailure(error: unknown): string {
	if (!(error instanceof ApiError))
		return t("网络不通，请检查网络后重试", "Could not reach the server. Check your connection.");
	switch (error.code) {
		case "code_invalid": {
			const left = Number(error.details?.remainingAttempts ?? 0);
			return t(`验证码不对，还能试 ${left} 次`, `That code is not right. ${left} tries left.`);
		}
		case "code_expired":
			return t("验证码过期了，请重新获取", "That code has expired. Ask for a new one.");
		case "code_rate_limited":
		case "rate_limited": {
			const seconds = Number(error.details?.retryAfter ?? 60);
			return t(`操作太频繁，请 ${seconds} 秒后再试`, `Too many attempts. Try again in ${seconds} seconds.`);
		}
		case "invalid_request":
			return error.details?.field === "confirmHandle"
				? t("和你的 ID 不一致", "That does not match your ID")
				: t("请求不对，请检查后重试", "That request was not valid. Check it and try again.");
		case "sms_not_configured":
			return t("这台服务器还不能发短信", "This server cannot send text messages yet.");
		case "handle_taken":
			return t("这个 ID 已经有人用了", "That ID is already taken");
		case "handle_reserved":
			return t("这个 ID 是保留词，换一个", "That ID is reserved");
		default:
			return t("操作失败，请稍后重试", "That did not work. Please try again.");
	}
}
