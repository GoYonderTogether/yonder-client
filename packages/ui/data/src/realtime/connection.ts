/**
 * The realtime connection: one socket, exponential backoff, and a heartbeat. It does not know what
 * an event means — the subscriber does (08 第六、七节).
 *
 * A close code that means "your session is gone" is reported as such and is not retried: retrying
 * with a revoked token would loop forever.
 */

import type { ClientEvent, ServerEvent } from "@yonder/protocol";
import {
	REALTIME_CLOSE_SESSION_REVOKED,
	REALTIME_CLOSE_UNAUTHORIZED,
	REALTIME_HEARTBEAT_MS,
	REALTIME_PATH,
} from "@yonder/protocol";

export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting" | "stopped";

export interface RealtimeHandlers {
	onEvent?: ((event: ServerEvent) => void) | undefined;
	onStatus?: ((status: ConnectionStatus) => void) | undefined;
	onSessionLost?: (() => void) | undefined;
}

export interface RealtimeOptions extends RealtimeHandlers {
	baseUrl: string;
	getAccessToken: () => string | null;
	/** Injectable for tests. */
	WebSocketImpl?: typeof WebSocket;
	schedule?: (fn: () => void, ms: number) => unknown;
	cancel?: (handle: unknown) => void;
}

// Keep jitter on every attempt without ever waiting more than three seconds.
const BACKOFF_MS = [
	[750, 1_250],
	[1_500, 2_500],
	[2_500, 3_000],
] as const;

export class RealtimeConnection {
	readonly #options: RealtimeOptions;
	#socket: WebSocket | null = null;
	#status: ConnectionStatus = "idle";
	#attempt = 0;
	#heartbeat: ReturnType<typeof setInterval> | null = null;
	#retryHandle: unknown = null;
	#wanted = false;
	#statusListeners = new Set<() => void>();
	#eventListeners = new Set<(event: ServerEvent) => void>();

	constructor(options: RealtimeOptions) {
		this.#options = options;
	}

	/** Replace the callbacks without rebuilding the socket; the app rebinds on every render. */
	setHandlers(handlers: RealtimeHandlers): void {
		this.#options.onEvent = handlers.onEvent;
		this.#options.onStatus = handlers.onStatus;
		this.#options.onSessionLost = handlers.onSessionLost;
	}

	get status(): ConnectionStatus {
		return this.#status;
	}

	subscribe = (listener: () => void): (() => void) => {
		this.#statusListeners.add(listener);
		return () => this.#statusListeners.delete(listener);
	};

	subscribeEvents(listener: (event: ServerEvent) => void): () => void {
		this.#eventListeners.add(listener);
		return () => {
			this.#eventListeners.delete(listener);
		};
	}

	send(event: ClientEvent): boolean {
		if (this.#socket?.readyState !== 1) return false;
		this.#socket.send(JSON.stringify(event));
		return true;
	}

	connect(): void {
		if (this.#socket) return;
		this.#wanted = true;
		this.#open();
	}

	stop(): void {
		this.#wanted = false;
		this.#clearTimers();
		const socket = this.#socket;
		this.#socket = null;
		socket?.close();
		this.#setStatus("stopped");
	}

	#open(): void {
		if (this.#socket) return;
		const token = this.#options.getAccessToken();
		if (!token || !this.#wanted) {
			// Without a token there is nothing to authenticate with; a later `connect` retries.
			this.#setStatus("idle");
			return;
		}
		const url = websocketUrl(this.#options.baseUrl, token);
		const Impl = this.#options.WebSocketImpl ?? globalThis.WebSocket;
		if (!Impl) return;

		this.#setStatus(this.#attempt === 0 ? "connecting" : "reconnecting");
		const socket = new Impl(url);
		this.#socket = socket;

		socket.addEventListener("open", () => {
			if (this.#socket !== socket) return;
			this.#attempt = 0;
			this.#setStatus("open");
			this.#startHeartbeat(socket);
		});
		socket.addEventListener("message", (event: MessageEvent) => {
			// A socket from a previous sign-in cannot show its messages to the current account.
			if (this.#socket !== socket) return;
			try {
				const parsed = JSON.parse(String(event.data)) as ServerEvent | { type: "pong" };
				if (parsed.type === "pong") return;
				this.#options.onEvent?.(parsed as ServerEvent);
				for (const listener of this.#eventListeners) listener(parsed as ServerEvent);
				// A dev panel can observe events without replacing the app's cache/session handler.
				if (import.meta.env.DEV && typeof window !== "undefined") {
					window.dispatchEvent(
						new CustomEvent("yonder-dev-realtime-event", {
							detail: { type: parsed.type, at: parsed.at, eventId: parsed.eventId },
						}),
					);
				}
			} catch {
				// A malformed frame is dropped; the connection stays.
			}
		});
		socket.addEventListener("close", (event: CloseEvent) => {
			if (this.#socket !== socket) return;
			this.#socket = null;
			this.#clearTimers();
			if (event.code === REALTIME_CLOSE_SESSION_REVOKED) {
				this.#setStatus("stopped");
				this.#options.onSessionLost?.();
				return;
			}
			if (event.code === REALTIME_CLOSE_UNAUTHORIZED) {
				this.#setStatus("stopped");
				this.#options.onSessionLost?.();
				return;
			}
			this.#scheduleReconnect();
		});
		socket.addEventListener("error", () => {
			// `close` follows an error; the reconnect is scheduled there.
		});
	}

	#scheduleReconnect(): void {
		if (!this.#wanted) return;
		this.#setStatus("reconnecting");
		const [min, max] = BACKOFF_MS[Math.min(this.#attempt, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[0];
		const jittered = min + Math.random() * (max - min);
		this.#attempt += 1;
		const schedule = this.#options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
		this.#retryHandle = schedule(() => this.#open(), jittered);
	}

	#startHeartbeat(socket: WebSocket): void {
		this.#heartbeat = setInterval(() => {
			if (socket.readyState === 1) socket.send(JSON.stringify({ type: "ping", at: new Date().toISOString() }));
		}, REALTIME_HEARTBEAT_MS);
	}

	#clearTimers(): void {
		if (this.#heartbeat) clearInterval(this.#heartbeat);
		this.#heartbeat = null;
		if (this.#retryHandle !== null) {
			const cancel = this.#options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
			cancel(this.#retryHandle);
			this.#retryHandle = null;
		}
	}

	#setStatus(status: ConnectionStatus): void {
		this.#status = status;
		this.#options.onStatus?.(status);
		for (const listener of this.#statusListeners) listener();
	}
}

/** `http://host` → `ws://host/v1/realtime?token=…`; `https` → `wss`. */
export function websocketUrl(baseUrl: string, token: string): string {
	const origin = baseUrl === "" ? (globalThis.location?.origin ?? "") : baseUrl;
	const url = new URL(REALTIME_PATH, origin === "" ? "http://localhost" : origin);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("token", token);
	return url.toString();
}
