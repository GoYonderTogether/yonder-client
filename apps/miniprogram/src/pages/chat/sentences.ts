import { runFailureText, scheduleFailureText } from "@yonder/chat-model";
import { currentLocale, t } from "../../lib/i18n";
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

/** A failed run's sentence and tone, from the one table the web app reads too. */
export function runFailure(reason: string | null | undefined) {
	return runFailureText(reason, currentLocale());
}

/** A plan that did not run, with the plan's own title. */
export function scheduleFailure(reason: string | null | undefined, title: string) {
	return scheduleFailureText(reason, title, currentLocale());
}
