import { chatCacheGeneration, readChatCache, updateChatCache } from "@yonder/ui-data";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
	type ChatVoice,
	VOICE_CHECKPOINT_BYTES,
	VOICE_MAX_BYTES,
	VOICE_MIN_BYTES,
	voiceBytes,
	voiceDuration,
} from "../lib/chat-voice.ts";
import { voiceMicrophone, voiceWorklet } from "../lib/voice-input.ts";
import { startVoiceTranscript } from "../lib/voice-transcript.ts";

type Phase = "loading" | "idle" | "starting" | "held" | "locked" | "saved" | "sending" | "transcribing";
type Capture = {
	recording: ChatVoice;
	generation: number;
	bytes: number;
	resumed: boolean;
	pending: ArrayBuffer[];
	pendingBytes: number;
	path: string;
	context?: AudioContext;
	stream?: MediaStream;
	node?: AudioWorkletNode;
	preview?: ReturnType<typeof startVoiceTranscript>;
	flush?: () => void;
	locked: boolean;
};

function release(capture: Capture) {
	capture.stream?.getTracks().forEach((track) => {
		track.onended = null;
		track.stop();
	});
	capture.node?.disconnect();
	void capture.context?.close().catch(() => {});
}

function checkpoint(capture: Capture) {
	if (!capture.pendingBytes) return;
	capture.recording.parts.push(new Blob(capture.pending));
	capture.pending = [];
	capture.pendingBytes = 0;
}

export function useChatVoiceCapture({
	scope,
	pendingPermission,
	onError,
	onActivityChange,
	knownNonce,
	openVoiceSocket,
}: {
	scope: string;
	pendingPermission: () => Promise<void> | undefined;
	onError: (key: string) => void;
	onActivityChange?: ((active: boolean) => void) | undefined;
	openVoiceSocket?: (() => WebSocket) | undefined;
	knownNonce?: ((nonce: string) => boolean) | undefined;
}) {
	const key = `chat-voice:${scope}`;
	const [phase, setPhase] = useState<Phase>("loading");
	const [duration, setDuration] = useState(0);
	const [preview, setPreview] = useState("");
	const current = useRef<Capture | null>(null);
	const restored = useRef<ChatVoice | undefined>(undefined);
	const mounted = useRef(false);
	const operation = useRef<AbortController | undefined>(undefined);
	const callbacks = useRef({ onError, onActivityChange });
	callbacks.current = { onError, onActivityChange };

	const persist = useCallback(
		(recording: ChatVoice, generation: number) => {
			if (generation !== chatCacheGeneration()) return;
			const saved = { ...recording, parts: [...recording.parts] };
			return updateChatCache<ChatVoice>(
				key,
				(value) => (!value || value.nonce === saved.nonce ? saved : value),
				generation,
			);
		},
		[key],
	);

	const discard = useCallback(
		(recording: ChatVoice, generation = chatCacheGeneration()) => {
			return updateChatCache<ChatVoice>(
				key,
				(old) => (old?.nonce === recording.nonce ? undefined : old),
				generation,
			).then(() => {
				if (restored.current?.nonce === recording.nonce) restored.current = undefined;
			});
		},
		[key],
	);

	const end = useCallback(
		(capture: Capture, keep: boolean) => {
			if (current.current !== capture) return;
			current.current = null;
			capture.flush?.();
			capture.preview?.stop();
			release(capture);
			callbacks.current.onActivityChange?.(false);
			if (keep && capture.bytes >= VOICE_MIN_BYTES) {
				checkpoint(capture);
				restored.current = capture.recording;
				void persist(capture.recording, capture.generation)?.catch(() => {
					if (mounted.current) callbacks.current.onError("chat.cacheFailed");
				});
			} else {
				restored.current = undefined;
				void discard(capture.recording, capture.generation).catch(() => {
					if (mounted.current) callbacks.current.onError("chat.cacheFailed");
				});
			}
			if (mounted.current) {
				setPreview("");
				setPhase(restored.current ? "saved" : "idle");
			}
		},
		[discard, persist],
	);

	const interrupt = useCallback(() => {
		const capture = current.current;
		if (capture) end(capture, capture.locked);
	}, [end]);

	useLayoutEffect(() => {
		mounted.current = true;
		let active = true;
		const generation = chatCacheGeneration();
		const hidden = () => {
			if (document.hidden) interrupt();
		};
		document.addEventListener("visibilitychange", hidden);
		window.addEventListener("pagehide", interrupt);
		void readChatCache<ChatVoice>(key).then(
			(recording) => {
				if (!active || chatCacheGeneration() !== generation) return;
				restored.current = recording;
				setDuration(recording ? voiceDuration(recording) : 0);
				setPhase(recording ? "saved" : "idle");
			},
			() => {
				if (!active) return;
				setPhase("idle");
			},
		);
		return () => {
			operation.current?.abort();
			interrupt();
			active = false;
			mounted.current = false;
			document.removeEventListener("visibilitychange", hidden);
			window.removeEventListener("pagehide", interrupt);
		};
	}, [interrupt, key]);

	function lock() {
		const capture = current.current;
		if (!capture || capture.locked) return;
		capture.locked = true;
		setPhase("locked");
	}

	async function start(resume = false, preparedContext?: AudioContext) {
		if (current.current || operation.current || !mounted.current || (restored.current && !resume)) {
			void preparedContext?.close().catch(() => {});
			return;
		}
		if (!navigator.mediaDevices?.getUserMedia || !globalThis.AudioContext || !globalThis.AudioWorkletNode) {
			void preparedContext?.close().catch(() => {});
			onError("chat.voiceUnsupported");
			return;
		}
		const recording = (resume && restored.current) || { nonce: crypto.randomUUID(), parts: [] };
		const bytes = voiceBytes(recording);
		const capture: Capture = {
			recording,
			generation: chatCacheGeneration(),
			bytes,
			resumed: bytes > 0,
			pending: [],
			pendingBytes: 0,
			path: window.location.pathname,
			locked: resume,
		};
		if (recording.frozen || capture.bytes >= VOICE_MAX_BYTES) {
			void preparedContext?.close().catch(() => {});
			return;
		}
		current.current = capture;
		setDuration(voiceDuration(recording));
		setPreview("");
		setPhase(resume ? "locked" : "starting");
		onError("");
		onActivityChange?.(true);
		try {
			const context = preparedContext ?? new AudioContext();
			capture.context = context;
			const script = URL.createObjectURL(new Blob([voiceWorklet], { type: "text/javascript" }));
			const graph = Promise.all([
				context.resume(),
				context.audioWorklet.addModule(script).finally(() => URL.revokeObjectURL(script)),
			]);
			const microphone = (async () => {
				await pendingPermission();
				if (current.current !== capture) return;
				const stream = await navigator.mediaDevices.getUserMedia({ audio: voiceMicrophone });
				if (current.current !== capture) {
					for (const track of stream.getTracks()) track.stop();
					return;
				}
				capture.stream = stream;
				return stream;
			})();
			const [, stream] = await Promise.all([graph, microphone]);
			if (!stream || current.current !== capture) return;
			const node = new AudioWorkletNode(context, "voice-input");
			capture.node = node;
			const interrupted = () => {
				if (current.current !== capture) return;
				end(capture, capture.locked);
			};
			stream.getAudioTracks().forEach((track) => {
				track.onended = interrupted;
			});
			context.onstatechange = () => {
				if (context.state !== "running") interrupted();
			};
			node.port.onmessage = ({ data }: MessageEvent<ArrayBuffer | "flushed">) => {
				if (current.current !== capture) return;
				if (data === "flushed") {
					capture.flush?.();
					return;
				}
				const capacity = VOICE_MAX_BYTES - capture.bytes;
				const frame = data.byteLength > capacity ? data.slice(0, capacity) : data;
				if (!frame.byteLength) return;
				capture.preview?.frame(frame);
				capture.bytes += frame.byteLength;
				capture.pending.push(frame);
				capture.pendingBytes += frame.byteLength;
				if (capture.pendingBytes >= VOICE_CHECKPOINT_BYTES) {
					checkpoint(capture);
					void persist(capture.recording, capture.generation)?.catch(() => {
						if (mounted.current) callbacks.current.onError("chat.cacheFailed");
					});
				}
				setDuration(Math.floor(capture.bytes / 32_000) * 1000);
				if (operation.current) return;
				if (capture.bytes >= VOICE_MAX_BYTES) end(capture, true);
				else if (capture.bytes >= 60_000 * 32) lock();
			};
			context.createMediaStreamSource(stream).connect(node).connect(context.destination);
			if (!capture.locked) setPhase("held");
			if (openVoiceSocket) {
				capture.preview = startVoiceTranscript(openVoiceSocket, (text) => {
					if (current.current === capture) setPreview(text);
				});
			}
		} catch (error) {
			if (current.current !== capture) return;
			onError(
				error instanceof DOMException && error.name === "NotAllowedError"
					? "chat.microphoneDenied"
					: "chat.recordingFailed",
			);
			end(capture, resume);
		}
	}

	const acceptedRecording =
		phase === "saved" && restored.current && knownNonce?.(restored.current.nonce) ? restored.current : undefined;
	useLayoutEffect(() => {
		if (!acceptedRecording) return;
		void discard(acceptedRecording).then(
			() => {
				if (mounted.current && !current.current && !operation.current) setPhase("idle");
			},
			() => callbacks.current.onError("chat.cacheFailed"),
		);
	}, [acceptedRecording, discard]);

	async function finish(
		action: (recording: ChatVoice, signal: AbortSignal, liveText?: string) => Promise<unknown>,
		destination: "send" | "text" = "send",
	) {
		const capture = current.current;
		const recording = capture?.recording ?? restored.current;
		if (!recording || operation.current || (recording.frozen && destination === "text")) return;
		if (capture && capture.path !== window.location.pathname) {
			end(capture, capture.locked);
			return;
		}
		const controller = new AbortController();
		operation.current = controller;
		setPhase(destination === "text" ? "transcribing" : "sending");
		const generation = capture?.generation ?? chatCacheGeneration();
		const stopPreview = capture?.preview?.stop;
		if (stopPreview) controller.signal.addEventListener("abort", stopPreview, { once: true });
		try {
			let flushed = false;
			if (capture?.node) {
				flushed = await new Promise<boolean>((resolve) => {
					const fallback = setTimeout(() => resolve(false), 250);
					capture.flush = () => {
						clearTimeout(fallback);
						resolve(true);
					};
					capture.node?.port.postMessage("flush");
				});
			}
			if (!mounted.current || (capture && current.current !== capture)) return;
			if (capture) {
				checkpoint(capture);
				current.current = null;
				release(capture);
				callbacks.current.onActivityChange?.(false);
			}
			setPreview("");
			if (voiceBytes(recording) < VOICE_MIN_BYTES) {
				await discard(recording, generation);
				return;
			}
			// A resumed draft includes PCM from before this socket opened.
			const final = destination === "text" && flushed && !capture?.resumed ? capture?.preview?.finish() : undefined;
			if (!final) stopPreview?.();
			const frozen = destination === "send" ? { ...recording, frozen: true as const } : recording;
			restored.current = frozen;
			const saved = await persist(frozen, generation);
			if (saved?.nonce !== frozen.nonce) throw new Error("voice_draft_changed");
			const liveText = final ? await final : undefined;
			controller.signal.throwIfAborted();
			if (chatCacheGeneration() !== generation) return;
			await action(frozen, controller.signal, liveText);
			await discard(frozen, generation);
		} catch {
			if (mounted.current && !controller.signal.aborted)
				callbacks.current.onError(destination === "text" ? "chat.voiceFailed" : "chat.sendPreserved");
		} finally {
			if (stopPreview) controller.signal.removeEventListener("abort", stopPreview);
			stopPreview?.();
			if (operation.current === controller) operation.current = undefined;
			if (mounted.current && !current.current) setPhase(restored.current ? "saved" : "idle");
		}
	}

	function cancel() {
		const capture = current.current;
		if (capture) end(capture, false);
		else if (restored.current) {
			void discard(restored.current).then(
				() => {
					if (mounted.current) setPhase("idle");
				},
				() => callbacks.current.onError("chat.cacheFailed"),
			);
		}
	}

	return {
		phase,
		duration,
		preview,
		start,
		lock,
		finish,
		cancel,
		isLocked: () => current.current?.locked === true,
		hasAudio: () => (current.current?.bytes ?? 0) >= VOICE_MIN_BYTES,
		atLimit: duration >= 600_000,
		sendingRetry: phase === "saved" && restored.current?.frozen === true,
	};
}
