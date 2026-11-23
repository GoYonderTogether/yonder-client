import type { Conversation } from "@yonder/protocol";
import { MAIN_CONVERSATION } from "@yonder/ui-shell";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PresetSource } from "../pages/items-fly.tsx";
import { draftKey, mayFillDraft, type PresetOutcome, registerPresetTarget, requestPreset } from "./draft-preset.ts";
import type { useChatDraft } from "./use-chat-draft.ts";

/**
 * Prefill the main Bot draft from another screen. A phone can preview it in place when the frame
 * already holds the main Bot draft. Otherwise open the main conversation directly.
 */
export function useTaskPreset({
	person,
	primary,
	conversation,
	draft,
	open,
	mobile = false,
	path = "",
}: {
	person: { id: string } | null | undefined;
	primary: Conversation | undefined;
	conversation: Conversation | undefined;
	draft: ReturnType<typeof useChatDraft>;
	open: (path: string) => void;
	mobile?: boolean;
	path?: string;
}) {
	const { t } = useTranslation();
	/** The action label while it travels toward the prefilled composer. */
	const [flying, setFlying] = useState<{ source: PresetSource; mobile: boolean } | null>(null);
	const [pendingMainPreset, setPendingMainPreset] = useState<string | null>(null);
	const flown = useCallback(() => setFlying(null), []);
	const [drawerPath, setDrawerPath] = useState<string | null>(null);
	const pendingDrawerPreset = useRef<string | null>(null);
	const drawerSeed = useRef<{ revision: number; previous: string; conversationId: string } | null>(null);
	const drawerOpen = mobile && drawerPath === path;
	const mainPath = `/messages/${MAIN_CONVERSATION}`;
	const conversationId = conversation?.id;
	const applyPreset = useEffectEvent((phrase: string): PresetOutcome => {
		if (!draft.loaded) return "not-ready";
		if (!mayFillDraft(draft.text, draft.files.length)) return "refused";
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
		if (!mayFillDraft(draft.text, draft.files.length)) return;
		drawerSeed.current = { revision: draft.revision + 1, previous: draft.text, conversationId: id };
		draft.setText(phrase);
	});
	useEffect(() => {
		if (drawerOpen && draft.loaded && conversationId) applyDrawerPreset(conversationId);
	}, [drawerOpen, draft.loaded, conversationId]);

	function closeDrawer(preserveDraft = false) {
		setFlying(null);
		setDrawerPath(null);
		pendingDrawerPreset.current = null;
		const seed = drawerSeed.current;
		drawerSeed.current = null;
		if (
			!preserveDraft &&
			seed &&
			seed.conversationId === conversationId &&
			seed.revision === draft.revision &&
			!draft.sending
		)
			draft.setText(seed.previous);
	}
	const closeAfterNavigation = useEffectEvent(() => closeDrawer());
	useEffect(() => {
		if (drawerPath !== null && !drawerOpen) closeAfterNavigation();
	}, [drawerPath, drawerOpen]);

	useEffect(() => {
		if (!pendingMainPreset || path !== mainPath || !person || !primary) return;
		requestPreset(person.id, primary.id, pendingMainPreset);
		setPendingMainPreset(null);
	}, [pendingMainPreset, path, mainPath, person, primary]);

	function openMain(phrase?: string | null) {
		if (phrase) {
			if (person && primary) requestPreset(person.id, primary.id, phrase);
			else setPendingMainPreset(phrase);
		}
		open(mainPath);
	}

	function expandDrawer() {
		const phrase = pendingDrawerPreset.current;
		closeDrawer(true);
		openMain(phrase);
	}

	function openPreset(phrase: string, source?: PresetSource) {
		const preview = mobile && conversationId === primary?.id;
		setFlying(
			source && (conversationId !== primary?.id || !draft.loaded || mayFillDraft(draft.text, draft.files.length))
				? { source, mobile: preview }
				: null,
		);
		if (!preview) {
			openMain(phrase);
			return;
		}
		pendingDrawerPreset.current = phrase;
		setDrawerPath(path);
	}

	return {
		flying: (flying?.mobile ? drawerOpen : path === mainPath) ? flying : null,
		flown,
		openPreset,
		addGoal: (source?: PresetSource) => openPreset(t("tasks.presetGoal"), source),
		addSchedule: (source: PresetSource) => openPreset(t("tasks.presetSchedule"), source),
		drawerOpen,
		closeDrawer: () => closeDrawer(),
		expandDrawer,
	};
}
