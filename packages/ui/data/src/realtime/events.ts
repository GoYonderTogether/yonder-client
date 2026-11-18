/**
 * What an incoming event does to the cache (08 第六节). The table is deliberately explicit: an
 * event either patches a cached row in place or invalidates a parent key. It never refetches
 * everything.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { Conversation, Member, QuotaConfigResponse, ServerEvent } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { removeConversation, removeMember, writeMember } from "./member-cache.ts";
import { updateMessage, updateRun } from "./message-cache.ts";

export interface EventHandlers {
	onSessionLost?: () => void;
	onMemberUpdated?: (member: Member) => void;
	/** The open conversation is gone (its Bot was deleted): the frame goes back to the list. */
	onConversationRemoved?: (conversationId: string) => void;
	/** A member shown somewhere is gone; the screen that was showing it closes. */
	onMemberRemoved?: (memberId: string) => void;
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
	void queryClient.invalidateQueries({ queryKey: keys.schedules.all() });
	void queryClient.invalidateQueries({ queryKey: keys.items.all() });
	void queryClient.invalidateQueries({ queryKey: keys.memory.days() });
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
		case "conversation.removed": {
			// The conversation left this account's list: the row, its cached history and any open view go
			// with it (19 第三节). The handler is how the frame returns to the message list.
			removeConversation(queryClient, event.conversationId);
			handlers.onConversationRemoved?.(event.conversationId);
			break;
		}
		case "member.updated": {
			// The payload is the whole member: it replaces the copy in the profile, the contacts, the
			// conversation rows and, when it is the account's Bot, `me.bot`. No request is needed.
			writeMember(queryClient, event.member);
			handlers.onMemberUpdated?.(event.member);
			break;
		}
		case "member.removed": {
			// A deleted Bot: drop it from every cached conversation and from contacts, so no row keeps
			// offering a chat with something that is gone.
			removeMember(queryClient, event.memberId);
			handlers.onMemberRemoved?.(event.memberId);
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
		case "quota.config_changed": {
			// The catalog is shared and versioned. A copy that is still the announced version stays;
			// any other copy is dropped, so the next balance naming the new version fetches once.
			const cached = queryClient.getQueryData<QuotaConfigResponse>(keys.quotaConfig());
			if (cached && cached.version !== event.version) queryClient.removeQueries({ queryKey: keys.quotaConfig() });
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
		case "subtask.updated": {
			// A task's state changed. The items page lists it and may have its detail open; the row
			// carries fields the event does not (the source, the state as the item maps it), so the
			// two queries are refetched rather than patched.
			void queryClient.invalidateQueries({ queryKey: keys.items.all() });
			break;
		}
		case "schedule.changed": {
			// The plan list carries next times and recent results, so it is refetched rather than patched.
			void queryClient.invalidateQueries({ queryKey: keys.schedules.all() });
			break;
		}
		case "memory.changed": {
			// A day was organized, edited, deleted or failed; the timeline is one paged query.
			void queryClient.invalidateQueries({ queryKey: keys.memory.days() });
			break;
		}
	}
}
