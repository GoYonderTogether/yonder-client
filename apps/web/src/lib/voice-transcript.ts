const SAMPLE_RATE = 16_000;
const STARTUP_MS = 5_000;
const FINISH_MS = 3_000;
const MAX_BACKLOG_BYTES = (SAMPLE_RATE * 2 * STARTUP_MS) / 1000;

type TranscriptEvent = {
	type?: unknown;
	sessionId?: unknown;
	sentenceId?: unknown;
	text?: unknown;
	final?: unknown;
};

/** The recorder retains its audio until a complete transcript is acknowledged. */
export function startVoiceTranscript(openSocket: () => WebSocket, onText: (text: string) => void) {
	let resolve: (text: string | undefined) => void = () => {};
	const result = new Promise<string | undefined>((settle) => {
		resolve = settle;
	});
	let socket: WebSocket;
	let sessionId: string;
	try {
		sessionId = crypto.randomUUID();
		socket = openSocket();
	} catch {
		resolve(undefined);
		return { frame: (_data: ArrayBuffer) => {}, stop: () => {}, finish: () => result, result };
	}

	let closed = false;
	let ready = false;
	let finishing = false;
	let text = "";
	const pending: ArrayBuffer[] = [];
	let pendingBytes = 0;
	const sentences = new Map<number, { text: string; final: boolean }>();
	let timeout = setTimeout(stop, STARTUP_MS);

	function stop() {
		complete(undefined);
	}

	function complete(finalText: string | undefined) {
		if (closed) return;
		closed = true;
		clearTimeout(timeout);
		pending.length = 0;
		sentences.clear();
		socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
		if (socket.readyState < WebSocket.CLOSING) socket.close();
		resolve(finalText);
	}

	function send(data: string | ArrayBuffer) {
		if (closed) return;
		const size = typeof data === "string" ? data.length : data.byteLength;
		if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount + size > MAX_BACKLOG_BYTES) {
			stop();
			return;
		}
		try {
			socket.send(data);
		} catch {
			stop();
		}
	}

	socket.onopen = () => send(JSON.stringify({ type: "start", sessionId, format: "pcm", sampleRate: SAMPLE_RATE }));
	socket.onclose = socket.onerror = stop;
	socket.onmessage = (event) => {
		if (closed) return;
		try {
			const message: TranscriptEvent | null = JSON.parse(event.data);
			if (message?.type === "error") {
				stop();
				return;
			}
			if (message?.sessionId !== sessionId) return;
			if (message.type === "ready" && !ready) {
				ready = true;
				if (!finishing) clearTimeout(timeout);
				for (const data of pending) send(data);
				pending.length = 0;
				if (finishing) send(JSON.stringify({ type: "finish" }));
				return;
			}
			if (message.type === "done" && finishing && ready) {
				complete([...sentences.values()].every((sentence) => sentence.final) ? text.trim() : undefined);
				return;
			}
			if (
				!ready ||
				message.type !== "transcript" ||
				typeof message.sentenceId !== "number" ||
				!Number.isSafeInteger(message.sentenceId) ||
				typeof message.text !== "string" ||
				sentences.get(message.sentenceId)?.final
			)
				return;
			sentences.set(message.sentenceId, { text: message.text, final: message.final === true });
			text = [...sentences]
				.sort(([left], [right]) => left - right)
				.map(([, sentence]) => sentence.text)
				.join("");
			onText(text);
		} catch {
			stop();
		}
	};

	return {
		frame(data: ArrayBuffer) {
			if (closed || finishing || data.byteLength === 0) return;
			if (ready) {
				send(data);
				return;
			}
			pendingBytes += data.byteLength;
			if (pendingBytes > MAX_BACKLOG_BYTES) stop();
			else pending.push(data);
		},
		finish() {
			if (!finishing && !closed) {
				finishing = true;
				clearTimeout(timeout);
				timeout = setTimeout(stop, FINISH_MS);
				if (ready) send(JSON.stringify({ type: "finish" }));
			}
			return result;
		},
		stop,
		result,
	};
}
