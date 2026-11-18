import type { MemoryFileSource, MemoryTarget } from "@yonder/protocol";
import { useBot, useConversations } from "@yonder/ui-data";
import { MAIN_CONVERSATION } from "@yonder/ui-shell";
import { useNavigate } from "react-router";
import { primaryConversation } from "../conversation-presentation.tsx";

/** The two `/me` files live in 「了解」; every other file has its own page under 「文件」. */
export const ABOUT_PATHS = ["/me/印象.md", "/me/近期.md"] as const;

export function memoryFileRoute(path: string): string {
	return path.startsWith("/me/") ? "/memory/about" : `/memory/files/${encodeURIComponent(path)}`;
}

export function useOpenMemoryFile() {
	const navigate = useNavigate();
	return (path: string) => navigate(memoryFileRoute(path));
}

/**
 * Where a source row goes: the conversation it came from (the primary one addressed as
 * `MAIN_CONVERSATION`, as the message list does), the item, or the scheduled-task list.
 */
export function useSourceNavigation() {
	const navigate = useNavigate();
	const conversations = useConversations();
	const bot = useBot();
	const conversation = (conversationId: string, meetingId?: string) => {
		const primary = primaryConversation(conversations.data?.items, bot?.id);
		const id = conversationId === primary?.id ? MAIN_CONVERSATION : conversationId;
		const meeting = meetingId ? `?meeting=${encodeURIComponent(meetingId)}` : "";
		navigate(`/messages/${encodeURIComponent(id)}${meeting}`);
	};
	return {
		/** A timeline card's source. */
		target: (target: MemoryTarget, meetingId?: string) => {
			if (target.type === "schedules") navigate("/tasks/scheduled");
			else conversation(target.conversationId, meetingId);
		},
		/** A file's source; null when the source has nowhere to open. */
		file: (source: MemoryFileSource): (() => void) | null => {
			const { itemId, conversationId, meetingId } = source;
			// A meeting opens in the recording capsule over its conversation (24 第七节).
			if (meetingId)
				return conversationId
					? () => conversation(conversationId, meetingId)
					: () => navigate(`/messages/${MAIN_CONVERSATION}?meeting=${encodeURIComponent(meetingId)}`);
			if (itemId) return () => navigate(`/tasks/${encodeURIComponent(itemId)}`);
			if (conversationId) return () => conversation(conversationId);
			return null;
		},
	};
}
