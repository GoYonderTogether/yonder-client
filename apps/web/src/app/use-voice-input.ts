import { useApi } from "@yonder/ui-data";
import { useCallback, useEffect, useRef, useState } from "react";
import { voiceMicrophone, voiceWorklet } from "../lib/voice-input.ts";
import { startVoiceTranscript } from "../lib/voice-transcript.ts";

const MAX_LISTENING_MS = 120_000;
const FLUSH_MS = 250;

type Session = {
	transcript?: ReturnType<typeof startVoiceTranscript>;
	stream?: MediaStream;
	context?: AudioContext;
	node?: AudioWorkletNode;
	finishing: boolean;
	resolve: () => void;
	done: Promise<void>;
	timer?: ReturnType<typeof setTimeout>;
	cleanup?: () => void;
};

const releaseAudio = (s: Session) => {
	s.node?.disconnect();
	delete s.node;
	for (const track of s.stream?.getTracks() ?? []) {
		track.onended = null;
		track.stop();
	}
	delete s.stream;
	if (s.context) void s.context.close().catch(() => {});
	delete s.context;
};

export function useVoiceInput(scope: string) {
	const api = useApi();
	const [isListening, setListening] = useState(false);
	const [error, setError] = useState("");
	const current = useRef<Session | null>(null);

	const end = useCallback((s: Session, error?: string) => {
		if (current.current !== s) return;
		current.current = null;
		clearTimeout(s.timer);
		s.cleanup?.();
		releaseAudio(s);
		s.transcript?.stop();
		setListening(false);
		if (error) setError(error);
		s.resolve();
	}, []);
	const cancel = useCallback(() => {
		if (current.current) end(current.current);
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
		if (!s.node) end(s);
		else {
			// Keep the source alive until the worklet flushes its last PCM frame.
			s.timer = setTimeout(() => end(s, "chat.voiceFailed"), FLUSH_MS);
			s.node.port.postMessage("flush");
		}
		return s.done;
	}, [end]);
	const start = useCallback(
		async (onText: (text: string) => void) => {
			if (current.current) return;
			let resolve = () => {};
			const done = new Promise<void>((settle) => {
				resolve = settle;
			});
			const s: Session = { finishing: false, resolve, done };
			current.current = s;
			setListening(true);
			setError("");
			const fail = () => end(s, "chat.voiceFailed");
			try {
				if (!navigator.mediaDevices?.getUserMedia || !globalThis.AudioContext || !globalThis.AudioWorkletNode)
					throw new Error("unsupported");
				const context = new AudioContext();
				s.context = context;
				const hide = () => {
					if (document.hidden) fail();
				};
				document.addEventListener("visibilitychange", hide);
				window.addEventListener("pagehide", fail);
				s.cleanup = () => {
					document.removeEventListener("visibilitychange", hide);
					window.removeEventListener("pagehide", fail);
				};
				const blob = URL.createObjectURL(new Blob([voiceWorklet], { type: "text/javascript" }));
				const microphone = navigator.mediaDevices.getUserMedia({ audio: voiceMicrophone }).then((stream) => {
					if (current.current === s) s.stream = stream;
					else for (const track of stream.getTracks()) track.stop();
					return stream;
				});
				const [stream] = await Promise.all([
					microphone,
					context.resume(),
					context.audioWorklet.addModule(blob).finally(() => URL.revokeObjectURL(blob)),
				]);
				if (current.current !== s) return;
				for (const track of stream.getAudioTracks()) track.onended = fail;
				context.onstatechange = () => {
					if (context.state === "suspended" && !s.finishing) fail();
				};
				const node = new AudioWorkletNode(context, "voice-input");
				s.node = node;
				const transcript = startVoiceTranscript(api.openVoiceSocket, onText);
				s.transcript = transcript;
				void transcript.result.then((text) => {
					if (text !== undefined) end(s);
					else fail();
				});
				node.port.onmessage = ({ data }: MessageEvent<ArrayBuffer | "flushed">) => {
					if (current.current !== s) return;
					if (data !== "flushed") transcript.frame(data);
					else if (s.finishing) {
						clearTimeout(s.timer);
						releaseAudio(s);
						void transcript.finish();
					}
				};
				s.timer = setTimeout(fail, MAX_LISTENING_MS);
				context.createMediaStreamSource(stream).connect(node).connect(context.destination);
			} catch (error) {
				if (error instanceof DOMException && error.name === "NotAllowedError") end(s, "chat.microphoneDenied");
				else fail();
			}
		},
		[api, end],
	);
	return { isListening, error, start, finish, cancel };
}
