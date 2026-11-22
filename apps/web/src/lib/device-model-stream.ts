const MAX_PART = 64 * 1024;
const MAX_CHAT = 2 * 1024 * 1024;
const TERMINALS = {
	openai: "data: [DONE]\n\n",
	anthropic: 'event: message_stop\ndata: {"type":"message_stop"}\n\n',
} as const;
const utf8 = new TextEncoder();

type ReplyBase = { mode: "device-local"; relayId: string };

export type DeviceModelReply = ReplyBase &
	(
		| { type: "provider.relay.head"; status: 200; contentType: "application/json" | "text/event-stream" }
		| { type: "provider.relay.chunk"; seq: number; part: string }
		| { type: "provider.relay.end"; nextSeq: number; error?: string }
	);

/** Each relay is single-socket and ordered. Nothing is retried on a new socket. */
export function deviceModelRelay(
	relayId: string,
	operation: "discover" | "chat",
	protocol: "openai" | "anthropic",
	send: (event: DeviceModelReply) => boolean,
) {
	const base = { mode: "device-local", relayId } as const;
	const terminal = TERMINALS[protocol];
	let nextSeq = 0;
	let room = MAX_CHAT - (operation === "chat" ? utf8.encode(terminal).length : 0);
	let headed = false;
	let closed = false;
	function transmit(event: DeviceModelReply): boolean {
		try {
			if (send(event)) return true;
		} catch {
			// The checked WebSocket can close before the write.
		}
		closed = true;
		return false;
	}
	function end(error?: string): boolean {
		if (closed) return false;
		closed = true;
		return transmit({ ...base, type: "provider.relay.end", nextSeq, ...(error ? { error } : {}) });
	}
	function write(part: string): boolean {
		if (closed) return false;
		if (!headed) {
			const contentType = operation === "discover" ? "application/json" : "text/event-stream";
			if (!transmit({ ...base, type: "provider.relay.head", status: 200, contentType })) return false;
			headed = true;
		}
		if (!transmit({ ...base, type: "provider.relay.chunk", seq: nextSeq, part })) return false;
		nextSeq += 1;
		return true;
	}
	function bounded(part: string): boolean {
		const size = utf8.encode(part).length;
		if (!size || size > MAX_PART || size > room) {
			end("invalid_response");
			return false;
		}
		room -= size;
		return write(part);
	}

	return {
		push: bounded,
		finishDiscovery(models: string[]) {
			return bounded(JSON.stringify({ data: models.map((id) => ({ id })) })) && end();
		},
		finishChat() {
			// Called only after the native HTTP reader attested its protocol-specific terminal.
			return write(terminal) && end();
		},
		fail: (error: string) => end(error),
	};
}
