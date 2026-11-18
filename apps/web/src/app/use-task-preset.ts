import type { Conversation, Member } from "@yonder/protocol";
import { MAIN_CONVERSATION } from "@yonder/ui-shell";
import { useEffect, useEffectEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { primaryConversation } from "../pages/conversation-presentation.tsx";
import { draftKey, type PresetOutcome, registerPresetTarget, requestPreset } from "./draft-preset.ts";
import type { useChatDraft } from "./use-chat-draft.ts";

/**
 * The plus button on 「事项 | 目标」 (16-3 第十节): navigate to the main Bot's chat and put a preset
 * sentence in its draft, never sending it. The navigation comes first, the fill follows at once, and
 * the fly-in is only feedback. The apply reads the draft through its own setters, so a draft the
 * user already typed in is never overwritten.
 */
export function useTaskPreset({
	person,
	bot,
	conversation,
	conversations,
	draft,
	open,
}: {
	person: { id: string } | null | undefined;
	bot: Member | null | undefined;
	conversation: Conversation | undefined;
	conversations: Conversation[] | undefined;
	draft: ReturnType<typeof useChatDraft>;
	open: (path: string) => void;
}) {
	const { t } = useTranslation();
	/** The sentence the plus button just put into the message box, while its fly-in is showing. */
	const [flying, setFlying] = useState<string | null>(null);
	const applyPreset = useEffectEvent((phrase: string): PresetOutcome => {
		if (!draft.loaded) return "not-ready";
		if (draft.text.trim()) return "refused";
		draft.setText(phrase);
		return "applied";
	});
	useEffect(() => {
		if (!person || !conversation) return;
		const key = draftKey(person.id, conversation.id);
		return registerPresetTarget(key, (phrase) => applyPreset(phrase));
	}, [person, conversation]);

	function addFromTasks(scheduled: boolean) {
		const primary = primaryConversation(conversations, bot?.id);
		const phrase = t(scheduled ? "tasks.presetGoal" : "tasks.presetItem");
		open(`/messages/${MAIN_CONVERSATION}`);
		if (!person || !primary) return;
		requestPreset(person.id, primary.id, phrase);
		setFlying(phrase);
	}

	return { flying, addFromTasks, flown: () => setFlying(null) };
}
