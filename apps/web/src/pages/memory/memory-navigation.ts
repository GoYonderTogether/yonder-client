import type { MemoryTarget } from "@yonder/protocol";
import { useBot, useConversations } from "@yonder/ui-data";
import { MAIN_CONVERSATION } from "@yonder/ui-shell";
import { useNavigate } from "react-router";
import { primaryConversation } from "../conversation-presentation.tsx";

/**
 * Where a source row goes: the conversation it came from (the primary one addressed as
 * `MAIN_CONVERSATION`, as the message list does) or the scheduled-task list.
 */
export function useSourceNavigation() {
	const navigate = useNavigate();
	const conversations = useConversations();
	const bot = useBot();
	return (target: MemoryTarget) => {
		if (target.type === "schedules") {
			navigate("/tasks/scheduled");
			return;
		}
		const primary = primaryConversation(conversations.data?.items, bot?.id);
		const id = target.conversationId === primary?.id ? MAIN_CONVERSATION : target.conversationId;
		navigate(`/messages/${encodeURIComponent(id)}`);
	};
}
