/**
 * The realtime channel: one WebSocket per client, server-pushed events. A client never polls to
 * ask "did anything change" — the server says so (08-前端缓存和同步 第一节).
 */

import type { Message, Run } from "../chat/chat.ts";
import type { Member } from "../member/member.ts";
import type { QuotaResponse } from "../quota/quota.ts";

export type ClientEvent = { type: "ping"; at: string } | { type: "ack"; lastEventId: string };

/** Events this slice actually sends. A member change is what makes a second tab update. */
export type ServerEvent =
	| { type: "member.updated"; eventId: string; at: string; member: Member }
	| { type: "quota.updated"; eventId: string; at: string; quota: QuotaResponse }
	| { type: "message.created" | "message.updated"; eventId: string; at: string; message: Message }
	| { type: "run.updated"; eventId: string; at: string; run: Run }
	| { type: "session.revoked"; eventId: string; at: string; sessionId: string };

export type ServerEventType = ServerEvent["type"];

/** `wss://…/v1/realtime?token=<accessToken>`; the token is validated during the handshake. */
export const REALTIME_PATH = "/v1/realtime";

/** Heartbeat interval the server sends at, and the client mirrors. */
export const REALTIME_HEARTBEAT_MS = 30_000;

/** Close codes the client acts on. */
export const REALTIME_CLOSE_UNAUTHORIZED = 4401;
export const REALTIME_CLOSE_SESSION_REVOKED = 4403;
