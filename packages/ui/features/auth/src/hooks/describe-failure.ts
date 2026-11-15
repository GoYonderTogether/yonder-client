/**
 * Turning an API failure into the sentence the user reads. One mapping, so the same failure says
 * the same thing everywhere.
 */
import { ApiError, NetworkError } from "@yonder/ui-data";

/** The shape of i18next's `t`, narrowed to what this file uses. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface FailureMessage {
	text: string;
	/** Where the error belongs: under the field, or as a banner over the form. */
	field?: "target" | "code" | "password" | "newPassword" | "confirmHandle";
}

export function describeFailure(error: unknown, t: Translate): FailureMessage {
	if (error instanceof NetworkError) return { text: t("auth.errors.network") };
	if (!(error instanceof ApiError)) return { text: t("auth.errors.unknown") };

	switch (error.code) {
		case "code_invalid": {
			const remaining = Number(error.details?.remainingAttempts ?? 0);
			return { text: t("auth.errors.codeInvalid", { remaining }), field: "code" };
		}
		case "code_expired":
			return { text: t("auth.errors.codeExpired"), field: "code" };
		case "code_rate_limited":
		case "rate_limited": {
			const seconds = Number(error.details?.retryAfter ?? 60);
			return {
				text: t(error.code === "code_rate_limited" ? "auth.errors.codeRateLimited" : "auth.errors.rateLimited", {
					seconds,
				}),
			};
		}
		case "password_invalid":
			return { text: t("auth.errors.passwordInvalid"), field: "password" };
		case "password_not_set":
			return { text: t("auth.errors.passwordNotSet"), field: "password" };
		case "sms_not_configured":
			return { text: t("auth.errors.smsNotConfigured") };
		case "invalid_request": {
			const field = error.details?.field;
			const reason = error.details?.reason;
			if (reason === "too_short") return { text: t("auth.errors.passwordTooShort"), field: "newPassword" };
			if (reason === "same_as_current") return { text: t("auth.errors.passwordSame"), field: "newPassword" };
			if (field === "confirmHandle")
				return { text: t("me.account.deleteAccountConfirmMismatch"), field: "confirmHandle" };
			if (field === "target") return { text: t("auth.errors.invalidPhone"), field: "target" };
			return { text: t("auth.errors.unknown") };
		}
		default:
			return { text: t(`errors.${error.code}`) };
	}
}
