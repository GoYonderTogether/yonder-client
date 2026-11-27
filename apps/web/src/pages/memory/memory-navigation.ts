import type { MemoryFileSource, MemoryTarget } from "@yonder/protocol";
import { useBot, useConversations } from "@yonder/ui-data";
import { MAIN_CONVERSATION } from "@yonder/ui-shell";
import { useNavigate } from "react-router";
import { primaryConversation } from "../conversation-presentation.tsx";
import { useOpenMeetingDetail } from "../meeting-detail.tsx";
import { useOpenTaskDetail } from "../task-detail.tsx";

/**
 * Where a source row goes: the conversation it came from (the primary one addressed as
 * `MAIN_CONVERSATION`, as the message list does), the item, or the scheduled-task list.
 */
export function useSourceNavigation() {
	const navigate = useNavigate();
	const openMeeting = useOpenMeetingDetail();
	const openTask = useOpenTaskDetail();
	const conversations = useConversations();
	const bot = useBot();
	const conversation = (conversationId: string) => {
		const primary = primaryConversation(conversations.data?.items, bot?.id);
		const id = conversationId === primary?.id ? MAIN_CONVERSATION : conversationId;
		navigate(`/messages/${encodeURIComponent(id)}`);
	};
	const meeting = (id: string, title?: string) => {
		if (!openMeeting(id, title)) navigate(`/tasks/${encodeURIComponent(id)}`);
	};
	return {
		/** A timeline card's source. */
		target: (target: MemoryTarget | null, meetingId?: string, title?: string) => {
			if (meetingId) meeting(meetingId, title);
			else if (target?.type === "schedules") navigate("/tasks/scheduled");
			else if (target) conversation(target.conversationId);
		},
		/** A file's source; null when the source has nowhere to open. */
		file: (source: MemoryFileSource): (() => void) | null => {
			const { itemId, conversationId, meetingId } = source;
			if (meetingId) return () => meeting(meetingId, source.title);
			if (itemId)
				return () => {
					if (!openTask(itemId, source.title)) navigate(`/tasks/${encodeURIComponent(itemId)}`);
				};
			if (conversationId) return () => conversation(conversationId);
			return null;
		},
	};
}
