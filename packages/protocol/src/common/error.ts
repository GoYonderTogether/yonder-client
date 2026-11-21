/**
 * Machine-readable error codes. The interface maps `messageKey` to a sentence; `code` is what
 * code branches on. Kept as a const object so the same list exists at runtime on both sides.
 */
export const ERROR_CODES = [
	"invalid_request",
	"unauthenticated",
	"token_expired",
	"forbidden",
	"account_suspended",
	"account_pending_deletion",
	"account_deleted",
	"not_found",
	"handle_taken",
	"handle_cooldown",
	"handle_reserved",
	"phone_taken",
	"invite_invalid",
	"conflict_version",
	"default_bot_protected",
	"conversation_closed",
	"visit_limit",
	"visit_denied",
	"visit_cap",
	"visit_confirm",
	"compact_busy",
	"conversation_busy",
	"compact_unsupported",
	"compact_failed",
	"code_invalid",
	"code_expired",
	"code_rate_limited",
	"password_invalid",
	"password_missing",
	"password_not_set",
	"session_revoked",
	"refresh_reused",
	"upload_invalid",
	"rate_limited",
	"internal",
	"sms_not_configured",
	"wechat_not_configured",
	"wechat_invalid",
	"wechat_conflict",
	"upstream_unavailable",
	"tools_quota_exhausted",
	/** A memory file over its length limit; `details` carries `length`, `limit` and `unit` (23 7.5). */
	"memory_too_long",
	/** A memory write that looked like a password, credential or verification code (23 第九节). */
	"memory_secret_refused",
	/** A Bot tried to replace a file the owner edited; it may only append (23 7.5). */
	"memory_user_edited",
	/** A connector request could be authorized on several devices; the user picks one. */
	"device_required",
	/** No online device can carry out the connector grant right now. */
	"device_offline",
	/** The card's connector set changed since the caller read it; show the latest view, do not send. */
	"request_changed",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** The single failure shape of every endpoint (06-API清单 第一节). */
export interface ApiErrorBody {
	error: {
		code: ErrorCode;
		/** For developers. Never shown to a user. */
		message: string;
		/** i18n key the interface resolves, e.g. `auth.codeInvalid`. */
		messageKey: string;
		details?: Record<string, unknown>;
		requestId: string;
		traceId: string;
	};
}

/** ISO 8601 with an offset. A plain string in the protocol; parsed at the edges. */
export type Timestamp = string;
