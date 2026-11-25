/**
 * The sentence for a failed account action (handle, phone, deletion). The sign-in screens have
 * their own mapping in the auth feature; a feature may not import another feature, so the few
 * codes the account pages can hit are mapped here, and anything else falls back to the generic
 * `errors.<code>` sentence the server's own code selects.
 */
import { ApiError, NetworkError } from "@yonder/ui-data";
import { formatInstant } from "@yonder/ui-time";

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface AccountFailure {
	text: string;
	field?: "handle" | "target" | "confirmHandle";
}

/**
 * A date inside a failure sentence, read on the account's calendar so a cooldown ends on the same
 * day on every device. `context.zone` comes from the caller's `useAccountTimeZone()`.
 */
function readableDate(iso: unknown, locale: string, zone: string): string {
	if (typeof iso !== "string") return "";
	return formatInstant(iso, { zone, locale, style: "date", width: "short" });
}

/** The language the sentence and its date are written in, and the account's zone. */
export interface FailureContext {
	locale: string;
	zone: string;
}

export function describeAccountFailure(error: unknown, t: Translate, context: FailureContext): AccountFailure {
	if (error instanceof NetworkError) return { text: t("auth.errors.network") };
	if (!(error instanceof ApiError)) return { text: t("auth.errors.unknown") };
	switch (error.code) {
		case "handle_taken":
			return { text: t("me.handle.errors.taken"), field: "handle" };
		case "handle_reserved":
			return { text: t("me.handle.errors.reserved"), field: "handle" };
		case "handle_cooldown":
			return {
				text: t("me.handle.errors.cooldown", {
					date: readableDate(error.details?.nextChangeAt, context.locale, context.zone),
				}),
				field: "handle",
			};
		case "phone_taken":
			return { text: t("auth.errors.phoneTaken"), field: "target" };
		case "code_invalid":
			// Either code may be the wrong one, so the sentence is a banner, not tied to one input.
			return { text: t("auth.errors.codeInvalid", { remaining: Number(error.details?.remainingAttempts ?? 0) }) };
		case "code_expired":
			return { text: t("auth.errors.codeExpired") };
		case "code_rate_limited":
		case "rate_limited": {
			const seconds = Number(error.details?.retryAfter ?? 60);
			return {
				text: t(error.code === "code_rate_limited" ? "auth.errors.codeRateLimited" : "auth.errors.rateLimited", {
					seconds,
				}),
			};
		}
		case "invalid_request": {
			const field = error.details?.field;
			if (field === "handle") return { text: t("me.handle.errors.invalid"), field: "handle" };
			if (field === "newTarget" || field === "target") {
				return { text: t("auth.errors.invalidPhone"), field: "target" };
			}
			if (field === "confirmHandle") {
				return { text: t("me.account.deleteAccountConfirmMismatch"), field: "confirmHandle" };
			}
			return { text: t("auth.errors.unknown") };
		}
		default:
			return { text: t(`errors.${error.code}`) };
	}
}
