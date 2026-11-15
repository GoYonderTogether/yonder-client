import Taro from "@tarojs/taro";
import type { ServerEvent } from "@yonder/protocol";
import { REALTIME_CLOSE_SESSION_REVOKED, REALTIME_HEARTBEAT_MS, REALTIME_PATH } from "@yonder/protocol";
import { useSyncExternalStore } from "react";

const eventListeners = new Set<(event: ServerEvent) => void>();
const revisionListeners = new Set<() => void>();
let revision = 0;
let socket: Taro.SocketTask | null = null;
let wanted = false;
let opening: Promise<void> | null = null;
let connectionGeneration = 0;
let retry: ReturnType<typeof setTimeout> | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let attempt = 0;
let connection: { baseUrl: string; token(): string | null; refresh(): Promise<boolean>; lost(): void };

export function configureRealtime(options: typeof connection) {
	connection = options;
}

export function subscribeEvents(listener: (event: ServerEvent) => void): () => void {
	eventListeners.add(listener);
	return () => {
		eventListeners.delete(listener);
	};
}

export function invalidateRealtime(): void {
	revision += 1;
	for (const listener of [...revisionListeners]) listener();
}

export function useRealtimeRevision(): number {
	return useSyncExternalStore(
		(listener) => {
			revisionListeners.add(listener);
			return () => {
				revisionListeners.delete(listener);
			};
		},
		() => revision,
	);
}

export function suspendRealtime(): void {
	wanted = false;
	connectionGeneration += 1;
	opening = null;
	clearTimeout(retry);
	clearInterval(heartbeat);
	const previous = socket;
	socket = null;
	void previous?.close({ code: 1000 });
}

export async function resumeRealtime(): Promise<void> {
	wanted = true;
	if (socket || !connection?.token()) return;
	if (!opening) {
		const pending = open().finally(() => {
			if (opening === pending) opening = null;
		});
		opening = pending;
	}
	await opening;
}

async function open(): Promise<void> {
	if (!wanted || socket) return;
	const generation = connectionGeneration;
	const token = connection.token();
	if (!token) return;
	try {
		const task = await Taro.connectSocket({
			url: `${connection.baseUrl.replace(/^http/, "ws")}${REALTIME_PATH}?token=${encodeURIComponent(token)}`,
		});
		if (!wanted || generation !== connectionGeneration) {
			void task.close({ code: 1000 });
			return;
		}
		socket = task;
		task.onOpen(() => {
			if (socket !== task) return;
			attempt = 0;
			invalidateRealtime();
			heartbeat = setInterval(() => {
				void task.send({ data: JSON.stringify({ type: "ping", at: new Date().toISOString() }) });
			}, REALTIME_HEARTBEAT_MS);
		});
		task.onMessage(({ data }) => {
			if (socket !== task || typeof data !== "string") return;
			let event: ServerEvent;
			try {
				event = JSON.parse(data);
			} catch {
				return;
			}
			if ((event as { type: string }).type === "pong") return;
			if (event.type === "session.revoked") {
				connection.lost();
				return;
			}
			for (const listener of eventListeners) listener(event);
		});
		task.onClose(({ code }) => {
			if (socket !== task) return;
			socket = null;
			clearInterval(heartbeat);
			if (code === REALTIME_CLOSE_SESSION_REVOKED) {
				connection.lost();
				return;
			}
			if (code === 4401) {
				void connection.refresh().then((ok) => {
					if (ok || connection.token()) schedule();
					else connection.lost();
				});
			} else schedule();
		});
		task.onError(() => {
			if (socket !== task) return;
			socket = null;
			clearInterval(heartbeat);
			void task.close({});
			schedule();
		});
	} catch {
		schedule();
	}
}

function schedule(): void {
	if (!wanted) return;
	clearTimeout(retry);
	retry = setTimeout(
		() => {
			void resumeRealtime();
		},
		Math.min(1000 * 2 ** attempt++, 30000),
	);
}
