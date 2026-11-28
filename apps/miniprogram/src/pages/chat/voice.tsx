import { Button as NativeButton, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui";
import { t } from "../../lib/i18n";
import { transcribeAudio } from "../../lib/runtime";
import { uploadCancellation } from "./upload-cancel";

export function VoiceInput({
	onText,
	onError,
	compact = false,
}: {
	onText: (text: string) => void;
	onError: (text: string) => void;
	compact?: boolean;
}) {
	const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
	const recorder = useRef<ReturnType<typeof Taro.getRecorderManager>>();
	const callbacks = useRef({ onText, onError });
	callbacks.current = { onText, onError };
	const lifetime = useRef<ReturnType<typeof uploadCancellation>>();
	const requested = useRef(false);
	useEffect(() => {
		if (process.env.TARO_ENV === "h5") return;
		const controller = uploadCancellation();
		const { signal } = controller;
		lifetime.current = controller;
		const manager = Taro.getRecorderManager();
		recorder.current = manager;
		manager.onStart(() => {
			if (!signal.aborted && requested.current) setState("recording");
		});
		manager.onStop((result) => {
			if (signal.aborted || !requested.current) return;
			requested.current = false;
			setState("transcribing");
			void transcribeAudio(result.tempFilePath, signal)
				.then((value) => {
					if (!signal.aborted) callbacks.current.onText(value.text);
				})
				.catch((error) => {
					if (!signal.aborted) callbacks.current.onError(error instanceof Error ? error.message : String(error));
				})
				.finally(() => {
					if (!signal.aborted) setState("idle");
				});
		});
		manager.onError((error) => {
			if (!signal.aborted && requested.current) {
				requested.current = false;
				setState("idle");
				callbacks.current.onError(error.errMsg);
			}
		});
		return () => {
			controller.abort();
			if (requested.current) manager.stop();
			requested.current = false;
			recorder.current = undefined;
		};
	}, []);
	const toggle = async () => {
		if (state === "transcribing") return;
		if (state === "recording") {
			recorder.current?.stop();
			return;
		}
		const signal = lifetime.current?.signal;
		if (!signal || signal.aborted || requested.current) return;
		requested.current = true;
		try {
			await Taro.authorize({ scope: "scope.record" });
			if (signal.aborted) return;
			recorder.current?.start({ duration: 60000, format: "wav", sampleRate: 16000, numberOfChannels: 1 });
		} catch {
			if (signal.aborted) return;
			requested.current = false;
			callbacks.current.onError(
				t("请在小程序设置中允许使用麦克风", "Allow microphone access in mini program settings"),
			);
			void Taro.openSetting();
		}
	};
	if (process.env.TARO_ENV === "h5") return null;
	if (compact)
		return (
			<NativeButton
				className="composer-tool mini-chat-icon-button mini-chat-voice"
				ariaLabel={
					state === "recording"
						? t("结束录音", "Finish recording")
						: state === "transcribing"
							? t("正在转录", "Transcribing")
							: t("语音输入", "Voice input")
				}
				disabled={state === "transcribing" ? true : undefined}
				onClick={() => void toggle()}
			>
				{state === "transcribing" ? (
					<View className="mini-chat-spinner" />
				) : state === "recording" ? (
					<View className="mini-chat-recording-icon" />
				) : (
					<View className="mini-chat-mic-icon" />
				)}
			</NativeButton>
		);
	return (
		<Button secondary loading={state === "transcribing"} onClick={() => void toggle()}>
			{state === "recording" ? t("结束录音", "Finish recording") : t("语音", "Voice")}
		</Button>
	);
}
