/**
 * Telling the main Bot is the only way to create or change a goal, a scheduled task or an item
 * (2026-11-24, Meta Muse as the reference). A control that offers 「编辑」 therefore does not open a
 * form: it puts one sentence in the main Bot's draft and lets the owner finish and send it.
 *
 * The frame owns the one preset mechanism (`useTaskPreset`); this context makes it reachable from
 * any page or side panel without a second copy of the draft rules.
 */
import { createContext, useContext } from "react";

/** Put `phrase` in the main Bot's draft. A draft that already has text is left alone. */
export type AskMainBot = (phrase: string, navigateToMain?: boolean) => void;

const AskMainBotContext = createContext<AskMainBot | null>(null);

export const AskMainBotProvider = AskMainBotContext.Provider;

export function useAskMainBot(): AskMainBot {
	const ask = useContext(AskMainBotContext);
	if (!ask) throw new Error("useAskMainBot needs the frame's AskMainBotProvider");
	return ask;
}
