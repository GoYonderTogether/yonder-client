import { ApiError } from "@yonder/ui-data";

/** i18next's lookup, narrowed to what this module needs. */
type Translate = (key: string) => string;

/**
 * The codes the Bot endpoints can answer with; each already has a sentence in the shared `errors`
 * table. `default_bot_protected` is the Bot-specific one and lives beside the rest of the Bot copy.
 */
const CODES = new Set([
	"invalid_request",
	"not_found",
	"forbidden",
	"unauthenticated",
	"token_expired",
	"upload_invalid",
	"rate_limited",
	"internal",
	"upstream_unavailable",
]);

/**
 * The real reason, never a stand-in (AGENTS.md). A known code gets the sentence that names what
 * happened; an unknown one falls back to the caller's sentence for the action, so no raw i18n key
 * ever reaches the screen.
 */
export function describeBotError(error: unknown, t: Translate, fallbackKey: string): string {
	if (error instanceof ApiError) {
		if (error.code === "default_bot_protected") return t("bots.defaultBotProtected");
		if (CODES.has(error.code)) return t(error.messageKey);
	}
	return t(fallbackKey);
}
