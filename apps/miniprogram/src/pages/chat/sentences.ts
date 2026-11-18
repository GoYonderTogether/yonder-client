import { t } from "../../lib/i18n";
import { runFailureSentence } from "./run-failure";
import { closureSentence, systemSentence } from "./system";

/**
 * The page-level wrappers around the pure sentences. They live apart from `system.ts` so the
 * sentence functions stay free of the locale store and readable by tests without a runtime.
 */
export function systemText(event: Parameters<typeof systemSentence>[0]): string {
	return t(systemSentence(event, "zh-CN"), systemSentence(event, "en"));
}

export function closureText(reason: Parameters<typeof closureSentence>[0]): string {
	return t(closureSentence(reason, "zh-CN"), closureSentence(reason, "en"));
}

export function runFailureText(reason: string | null | undefined): string {
	return t(runFailureSentence(reason, "zh-CN"), runFailureSentence(reason, "en"));
}
