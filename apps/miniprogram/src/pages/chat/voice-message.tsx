import { Button, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { downloadAttachment } from "../../lib/runtime";

type PlaybackState = "idle" | "loading" | "playing" | "paused" | "error";
type Playback = { audio: ReturnType<typeof Taro.createInnerAudioContext>; release: () => void };
let stopPreviousVoice: (() => void) | undefined;

export function VoiceMessage({ fileId, durationMs, self }: { fileId: string; durationMs: number; self: boolean }) {
	const [state, setState] = useState<PlaybackState>("idle");
	const playback = useRef<Playback | null>(null);
	useEffect(() => () => playback.current?.release(), []);

	async function togglePlayback() {
		if (state === "loading") return;
		if (playback.current) {
			const { audio } = playback.current;
			if (state === "playing") audio.pause();
			else audio.play();
			return;
		}

		let audio: ReturnType<typeof Taro.createInnerAudioContext>;
		try {
			audio = Taro.createInnerAudioContext();
		} catch {
			setState("error");
			return;
		}
		stopPreviousVoice?.();
		function release() {
			if (playback.current?.audio !== audio) return false;
			playback.current = null;
			if (stopPreviousVoice === stop) stopPreviousVoice = undefined;
			audio.destroy();
			return true;
		}
		function stop() {
			if (release()) setState("idle");
		}
		function fail() {
			if (release()) setState("error");
		}

		playback.current = { audio, release };
		stopPreviousVoice = stop;
		setState("loading");
		audio.onPlay(() => {
			if (playback.current?.audio === audio) setState("playing");
		});
		audio.onPause(() => {
			if (playback.current?.audio === audio) setState("paused");
		});
		audio.onEnded(stop);
		audio.onError(fail);
		try {
			const path = await downloadAttachment(fileId);
			if (playback.current?.audio !== audio) return;
			audio.src = path;
			audio.play();
		} catch {
			fail();
		}
	}

	const duration = `${Math.ceil(durationMs / 1000)}″`;
	const playing = state === "playing";
	const loading = state === "loading";
	const failed = state === "error";
	const label = loading
		? t("正在加载…", "Loading…")
		: failed
			? t("语音播放失败，点击重试", "Voice playback failed, tap to retry")
			: playing
				? t("暂停语音", "Pause voice message")
				: t("播放语音", "Play voice message");
	return (
		<Button
			className={`message-bubble message-voice-button mini-voice-button message-voice-${state} ${self ? "message-bubble-outgoing" : "message-bubble-incoming"}`}
			ariaLabel={`${label} · ${duration}`}
			disabled={loading || undefined}
			onClick={() => void togglePlayback()}
		>
			<Text ariaHidden>{loading ? "…" : failed ? "↻" : playing ? "Ⅱ" : "▶"}</Text>
			<Text className="message-voice-wave" ariaHidden>
				▃▇▅▂
			</Text>
			<Text className="message-voice-duration">{duration}</Text>
		</Button>
	);
}
