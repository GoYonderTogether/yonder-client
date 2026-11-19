import type { Conversation, Member } from "@yonder/protocol";
import { MAIN_CONVERSATION } from "@yonder/ui-shell";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { primaryConversation } from "../pages/conversation-presentation.tsx";
import { draftKey, type PresetOutcome, registerPresetTarget, requestPreset } from "./draft-preset.ts";
import type { useChatDraft } from "./use-chat-draft.ts";

/**
 * The task plus fills the main Bot's draft. On mobile the existing draft stays in the frame while
 * the task list is visible behind the chat sheet.
 */
export function useTaskPreset({
	person,
	bot,
	conversation,
	conversations,
	draft,
	open,
	mobile = false,
	path = "",
}: {
	person: { id: string } | null | undefined;
	bot: Member | null | undefined;
	conversation: Conversation | undefined;
	conversations: Conversation[] | undefined;
	draft: ReturnType<typeof useChatDraft>;
	open: (path: string) => void;
	mobile?: boolean;
	path?: string;
}) {
	const { t } = useTranslation();
	/** The sentence the plus button just put into the message box, while its fly-in is showing. */
	const [flying, setFlying] = useState<string | null>(null);
	const [drawerPath, setDrawerPath] = useState<string | null>(null);
	const pendingDrawerPreset = useRef<string | null>(null);
	const drawerSeed = useRef<{ revision: number; previous: string; conversationId: string } | null>(null);
	const drawerOpen = mobile && drawerPath === path;
	const conversationId = conversation?.id;
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
	const applyDrawerPreset = useEffectEvent((id: string) => {
		if (!pendingDrawerPreset.current) return;
		const phrase = pendingDrawerPreset.current;
		pendingDrawerPreset.current = null;
		if (draft.text.trim() || draft.files.length) return;
		drawerSeed.current = { revision: draft.revision + 1, previous: draft.text, conversationId: id };
		draft.setText(phrase);
	});
	useEffect(() => {
		if (drawerOpen && draft.loaded && conversationId) applyDrawerPreset(conversationId);
	}, [drawerOpen, draft.loaded, conversationId]);

	function closeDrawer() {
		setDrawerPath(null);
		pendingDrawerPreset.current = null;
		const seed = drawerSeed.current;
		drawerSeed.current = null;
		if (seed && seed.conversationId === conversation?.id && seed.revision === draft.revision && !draft.sending)
			draft.setText(seed.previous);
	}
	const closeAfterNavigation = useEffectEvent(closeDrawer);
	useEffect(() => {
		if (drawerPath !== null && !drawerOpen) closeAfterNavigation();
	}, [drawerPath, drawerOpen]);

	function openDrawer(phrase: string) {
		pendingDrawerPreset.current = phrase;
		setDrawerPath(path);
	}

	function addFromTasks(scheduled: boolean) {
		const phrase = t(scheduled ? "tasks.presetGoal" : "tasks.presetItem");
		if (mobile) {
			openDrawer(phrase);
			return;
		}
		const primary = primaryConversation(conversations, bot?.id);
		open(`/messages/${MAIN_CONVERSATION}`);
		if (!person || !primary) return;
		requestPreset(person.id, primary.id, phrase);
		setFlying(phrase);
	}

	return {
		flying,
		addFromTasks,
		flown: () => setFlying(null),
		drawerOpen,
		closeDrawer,
		addSchedule: mobile ? () => openDrawer(t("tasks.presetSchedule")) : undefined,
	};
}
