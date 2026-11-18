/**
 * The sentence for a failed group or privacy action. A feature may not import another feature, and
 * the two group-specific codes are not in the shared `errors` table, so they are named here; every
 * other code falls through to the sentence the server's own code selects.
 */
import { ApiError, NetworkError } from "@yonder/ui-data";
import type { Translate } from "../group/system-events.ts";

export function memberFailureText(error: unknown, t: Translate): string {
	if (!error) return "";
	if (error instanceof NetworkError) return t("members.errors.network");
	if (!(error instanceof ApiError)) return t("members.errors.unknown");
	switch (error.code) {
		case "conversation_closed":
			return t("members.errors.conversationClosed");
		case "default_bot_protected":
			return t("members.errors.defaultBotProtected");
		default:
			return t(`errors.${error.code}`);
	}
}
