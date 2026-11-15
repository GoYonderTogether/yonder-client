import { useApi } from "@yonder/ui-data";
import { useCallback, useEffect, useRef, useState } from "react";
import { voiceWorklet } from "../lib/voice-input.ts";

type Session = {
	socket?: WebSocket;
	stream?: MediaStream;
	context?: AudioContext;
	node?: AudioWorkletNode;
	active: boolean;
	finishing: boolean;
	ready: boolean;
	resolve: () => void;
	done: Promise<void>;
	onText: (text: string) => void;
	sentences: Map<string, string>;
	finalized: Set<string>;
	timer?: ReturnType<typeof setTimeout>;
	cleanup?: () => void;
};

const releaseAudio = (s: Session) => {
	s.node?.disconnect();
	delete s.node;
	for (const track of s.stream?.getTracks() ?? []) track.stop();
	delete s.stream;
	if (s.context) void s.context.close().catch(() => {});
	delete s.context;
};

export function useVoiceInput(scope: string) {
	const api = useApi();
	const [isListening, setListening] = useState(false);
	const [error, setError] = useState("");
	const current = useRef<Session | null>(null);

	const end = useCallback((s: Session, failed = false) => {
		if (!s.active) return;
		s.active = false;
		clearTimeout(s.timer);
		s.cleanup?.();
		releaseAudio(s);
		if (s.socket && s.socket.readyState < 2) s.socket.close();
		if (current.current === s) {
			current.current = null;
			setListening(false);
			if (failed) setError("chat.voiceFailed");
		}
		s.resolve();
	}, []);
	const cancel = useCallback(() => {
		const s = current.current;
		if (!s) return;
		if (s.socket?.readyState === 1) s.socket.send(JSON.stringify({ type: "cancel" }));
		end(s);
	}, [end]);
	useEffect(() => {
		if (!scope) return;
		return cancel;
	}, [scope, cancel]);
	const finish = useCallback(() => {
		const s = current.current;
		if (!s) return Promise.resolve();
		if (s.finishing) return s.done;
		s.finishing = true;
		setListening(false);
		clearTimeout(s.timer);
		s.timer = setTimeout(() => end(s, true), 10000);
		for (const track of s.stream?.getTracks() ?? []) track.stop();
		if (!s.ready || !s.node || s.socket?.readyState !== 1) {
			end(s);
			return s.done;
		}
		s.node.port.postMessage("flush");
		return s.done;
	}, [end]);
	const start = useCallback(
		async (onText: (text: string) => void) => {
			if (current.current) return;
			let resolve = () => {};
			const done = new Promise<void>((r) => {
				resolve = r;
			});
			const s: Session = {
				active: true,
				finishing: false,
				ready: false,
				resolve,
				done,
				onText,
				sentences: new Map(),
				finalized: new Set(),
			};
			current.current = s;
			setListening(true);
			setError("");
			try {
				if (!navigator.mediaDevices?.getUserMedia || !globalThis.AudioContext) throw new Error("unsupported");
				const context = new AudioContext();
				s.context = context;
				void context.resume().catch(() => end(s, true));
				const hide = () => {
					if (document.visibilityState === "hidden") end(s, true);
				};
				const pagehide = () => end(s, true);
				document.addEventListener("visibilitychange", hide);
				window.addEventListener("pagehide", pagehide);
				s.cleanup = () => {
					document.removeEventListener("visibilitychange", hide);
					window.removeEventListener("pagehide", pagehide);
				};
				const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
				if (!s.active || s.finishing) {
					for (const track of stream.getTracks()) track.stop();
					return;
				}
				s.stream = stream;
				for (const track of stream.getAudioTracks()) track.onended = () => end(s, true);
				s.timer = setTimeout(() => end(s, true), 10000);
				const sessionId = crypto.randomUUID();
				const socket = api.openVoiceSocket();
				s.socket = socket;
				socket.onopen = () => {
					if (s.active) socket.send(JSON.stringify({ type: "start", sessionId, format: "pcm", sampleRate: 16000 }));
				};
				socket.onerror = () => end(s, true);
				socket.onclose = () => end(s, s.active);
				socket.onmessage = (event) => {
					if (!s.active) return;
					try {
						const message = JSON.parse(event.data);
						if (message.type === "ready" && !s.ready) {
							s.ready = true;
							clearTimeout(s.timer);
							s.timer = setTimeout(() => end(s, true), 120000);
							void capture();
						} else if (
							message.type === "transcript" &&
							message.sessionId === sessionId &&
							typeof message.text === "string"
						) {
							const id = String(message.sentenceId);
							if (!s.finalized.has(id)) {
								s.sentences.set(id, message.text);
								if (message.final) s.finalized.add(id);
								s.onText(
									[...s.sentences.entries()]
										.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
										.map(([, text]) => text)
										.join(""),
								);
							}
						} else if (message.type === "done") end(s);
						else if (message.type === "error") end(s, true);
					} catch {
						end(s, true);
					}
				};
				async function capture() {
					try {
						const blob = URL.createObjectURL(new Blob([voiceWorklet], { type: "text/javascript" }));
						try {
							await context.audioWorklet.addModule(blob);
						} finally {
							URL.revokeObjectURL(blob);
						}
						if (!s.active || s.finishing) return;
						const node = new AudioWorkletNode(context, "voice-input");
						s.node = node;
						node.port.onmessage = (event) => {
							if (!s.active) return;
							if (event.data === "flushed") {
								if (s.finishing && socket.readyState === 1) {
									releaseAudio(s);
									socket.send(JSON.stringify({ type: "finish" }));
								}
								return;
							}
							if (socket.readyState !== 1 || socket.bufferedAmount > 32000) {
								end(s, true);
								return;
							}
							socket.send(event.data);
						};
						context.createMediaStreamSource(stream).connect(node).connect(context.destination);
						context.onstatechange = () => {
							if (context.state === "suspended" && s.active && !s.finishing) end(s, true);
						};
					} catch (err) {
						if (s.active && err instanceof DOMException && err.name === "NotAllowedError") {
							setError("chat.microphoneDenied");
							end(s);
						} else end(s, true);
					}
				}
			} catch (err) {
				if (s.active && err instanceof DOMException && err.name === "NotAllowedError") {
					setError("chat.microphoneDenied");
					end(s);
				} else end(s, true);
			}
		},
		[api, end],
	);
	return { isListening, error, start, finish, cancel };
}
