import { emptyQuestionDraft, type QuestionDraft } from "@yonder/chat-model";
import { readChatCache, updateChatCache, writeChatCache } from "@yonder/ui-data";
import { useEffect, useState } from "react";

export function useQuestionDraft(owner: string | undefined, conversationId: string, cardId: string, settled: boolean) {
	const key = owner ? `question:${owner}:${conversationId}:${cardId}` : null;
	const [record, setRecord] = useState<{ key: string; draft: QuestionDraft }>();
	useEffect(() => {
		if (!key) return;
		if (settled) {
			void updateChatCache(key, () => undefined).catch(() => {});
			return;
		}
		let active = true;
		void readChatCache<QuestionDraft>(key)
			.catch(() => undefined)
			.then((saved) => {
				if (active) setRecord({ key, draft: saved ?? emptyQuestionDraft });
			});
		return () => {
			active = false;
		};
	}, [key, settled]);

	return {
		draft: record && record.key === key ? record.draft : null,
		save(draft: QuestionDraft) {
			if (!key || settled) return;
			setRecord({ key, draft });
			void writeChatCache(key, draft).catch(() => {});
		},
	};
}
