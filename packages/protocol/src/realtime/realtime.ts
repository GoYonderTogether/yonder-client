/**
 * The realtime channel: one WebSocket per client, server-pushed events. A client never polls to
 * ask "did anything change" — the server says so (08-前端缓存和同步 第一节).
 */

import type { AgentCard } from "../cards/agent-card.ts";
import type { Conversation, Message, Run } from "../chat/chat.ts";
import type { Schedule } from "../chat/schedule.ts";
import type { SubtaskSummary } from "../chat/subtask.ts";
import type { ConnectorCommand, ConnectorGrant, ConnectorRequestView } from "../connectors/connectors.ts";
import type { FriendRequest } from "../member/friend-request.ts";
import type { Member } from "../member/member.ts";
import type { QuotaResponse } from "../quota/quota.ts";

export type ClientEvent =
	| { type: "ping"; at: string }
	| { type: "ack"; lastEventId: string }
	| { type: "connector.ready"; connectionIds: string[] }
	/** `toolsVersion` is the device's file-tool argument version; a device that omits it is V1. */
	| { type: "connector.ready"; connections: { id: string; revision: number; toolsVersion?: number }[] }
	/** The device answers one relayed provider call: a head, then body parts, then an end. */
	| { type: "provider.relay.head"; relayId: string; status: number; contentType?: string }
	| { type: "provider.relay.chunk"; relayId: string; part: string }
	| { type: "provider.relay.end"; relayId: string; error?: string };

export interface MessageNotification {
	id: string;
	conversationId: string;
	messageId: string;
	senderName: string;
	conversationTitle?: string;
	senderKind: "person" | "bot";
}

/** Events this slice actually sends. A member change is what makes a second tab update. */
export type ServerEvent =
	| { type: "friend_request.updated"; eventId: string; at: string; request: FriendRequest }
	| { type: "connectors.changed"; eventId: string; at: string }
	| { type: "connector.command"; eventId: string; at: string; command: ConnectorCommand }
	| { type: "connector.command.cancelled"; eventId: string; at: string; commandId: string }
	/** A connector request changed state; every endpoint patches the card from this payload. */
	| { type: "connector_request.updated"; eventId: string; at: string; request: ConnectorRequestView }
	/** An owner-only Agent card changed state; the card every endpoint is showing updates in place. */
	| { type: "agent-card.updated"; eventId: string; at: string; card: AgentCard }
	/** Sent only to the target device's sessions: store these grants locally, then report `connector.ready`. */
	| {
			type: "connector.grant.request";
			eventId: string;
			at: string;
			requestId: string;
			dispatchSeq?: number;
			grants: ConnectorGrant[];
	  }
	| { type: "devices.changed"; eventId: string; at: string }
	| { type: "conversation.updated"; eventId: string; at: string; conversation: Conversation }
	| { type: "conversation.state_changed"; eventId: string; at: string; conversationId: string }
	/** The conversation left this account's list: drop it, with its messages and any open view. */
	| { type: "conversation.removed"; eventId: string; at: string; conversationId: string }
	| { type: "member.updated"; eventId: string; at: string; member: Member }
	/** The member is gone (a deleted Bot): drop it wherever a client is still showing it. */
	| { type: "member.removed"; eventId: string; at: string; memberId: string }
	| { type: "quota.updated"; eventId: string; at: string; quota: QuotaResponse }
	/** The published catalog was edited: the client refetches it when the version differs. */
	| { type: "quota.config_changed"; eventId: string; at: string; version: number }
	| { type: "message.created" | "message.updated"; eventId: string; at: string; message: Message }
	| { type: "notification.created"; eventId: string; at: string; notification: MessageNotification }
	| { type: "run.updated"; eventId: string; at: string; run: Run }
	| { type: "subtask.updated"; eventId: string; at: string; subtask: SubtaskSummary }
	| { type: "schedule.changed"; eventId: string; at: string; schedule: Schedule }
	| { type: "goals.changed"; eventId: string; at: string }
	/** Timeline days and/or memory file paths changed. */
	| { type: "memory.changed"; eventId: string; at: string; dates?: string[]; paths?: string[] }
	| { type: "session.revoked"; eventId: string; at: string; sessionId: string }
	/** Sent only to the bound device's sessions: make this HTTP call locally and stream it back. */
	| {
			type: "provider.relay.request";
			eventId: string;
			at: string;
			relayId: string;
			url: string;
			headers: Record<string, string>;
			body: string;
	  }
	| { type: "provider.relay.cancel"; eventId: string; at: string; relayId: string };

export type ServerEventType = ServerEvent["type"];

/** `wss://…/v1/realtime?token=<accessToken>`; the token is validated during the handshake. */
export const REALTIME_PATH = "/v1/realtime";

/** Heartbeat interval the server sends at, and the client mirrors. */
export const REALTIME_HEARTBEAT_MS = 30_000;

/** Close codes the client acts on. */
export const REALTIME_CLOSE_UNAUTHORIZED = 4401;
export const REALTIME_CLOSE_SESSION_REVOKED = 4403;
