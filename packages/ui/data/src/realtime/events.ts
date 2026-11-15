/**
 * What an incoming event does to the cache (08 第六节). The table is deliberately explicit: an
 * event either patches a cached row in place or invalidates a parent key. It never refetches
 * everything.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { Conversation, Member, MeResponse, ServerEvent } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { updateMessage, updateRun } from "./message-cache.ts";

export interface EventHandlers {
	onSessionLost?: () => void;
	onMemberUpdated?: (member: Member) => void;
}

/** A socket can miss events while disconnected; reconcile the currently observed data on open. */
export function reconcileRealtime(queryClient: QueryClient): void {
	void queryClient.invalidateQueries({ queryKey: keys.devices() });
	void queryClient.invalidateQueries({ queryKey: keys.connectors.list() });
	void queryClient.invalidateQueries({ queryKey: keys.skills.all() });
	void queryClient.invalidateQueries({ queryKey: keys.sessions() });
	void queryClient.invalidateQueries({ queryKey: keys.conversations.all() });
	void queryClient.invalidateQueries({ queryKey: keys.messages.root() });
	void queryClient.invalidateQueries({ queryKey: keys.contacts() });
	void queryClient.invalidateQueries({ queryKey: keys.quota() });
	void queryClient.invalidateQueries({ queryKey: keys.usage("all") });
}

export function applyServerEvent(queryClient: QueryClient, event: ServerEvent, handlers: EventHandlers = {}): void {
	switch (event.type) {
		case "connectors.changed": {
			void queryClient.invalidateQueries({ queryKey: keys.connectors.list() });
			break;
		}
		case "devices.changed": {
			void queryClient.invalidateQueries({ queryKey: keys.devices() });
			void queryClient.invalidateQueries({ queryKey: keys.sessions() });
			break;
		}
		case "conversation.updated": {
			queryClient.setQueryData<{ items: Conversation[] }>(keys.conversations.list(), (current) => ({
				items: current?.items.some((item) => item.id === event.conversation.id)
					? current.items.map((item) =>
							item.id === event.conversation.id && item.version <= event.conversation.version
								? event.conversation
								: item,
						)
					: [event.conversation, ...(current?.items ?? [])],
			}));
			void queryClient.invalidateQueries({ queryKey: keys.contacts() });
			break;
		}
		case "member.updated": {
			// Replace in place: the payload is the whole member, so no request is needed.
			queryClient.setQueryData<MeResponse>(keys.me(), (current) =>
				current && current.member.id === event.member.id ? { ...current, member: event.member } : current,
			);
			handlers.onMemberUpdated?.(event.member);
			break;
		}
		case "session.revoked": {
			handlers.onSessionLost?.();
			break;
		}
		case "quota.updated": {
			queryClient.setQueryData(keys.quota(), event.quota);
			void queryClient.invalidateQueries({ queryKey: keys.ledger() });
			void queryClient.invalidateQueries({ queryKey: keys.usage("all") });
			void queryClient.invalidateQueries({ queryKey: keys.invite() });
			break;
		}
		case "message.created":
		case "message.updated": {
			updateMessage(queryClient, event.message);
			break;
		}
		case "run.updated": {
			updateRun(queryClient, event.run);
			if (event.run.status === "completed" || event.run.status === "failed" || event.run.status === "cancelled")
				void queryClient.invalidateQueries({ queryKey: keys.skills.all() });
			break;
		}
	}
}
