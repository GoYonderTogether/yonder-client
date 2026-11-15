import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { Attachment } from "@yonder/protocol";
import { useEffect, useState } from "react";
import { t } from "../../lib/i18n";
import { downloadAttachment } from "../../lib/runtime";

export function MessageAttachment({ file }: { file: Attachment }) {
	const [path, setPath] = useState("");
	const [error, setError] = useState("");
	useEffect(() => {
		let active = true;
		if (file.kind === "image")
			void downloadAttachment(file.id)
				.then((value) => {
					if (active) setPath(value);
				})
				.catch((e) => {
					if (active) setError(e instanceof Error ? e.message : String(e));
				});
		return () => {
			active = false;
		};
	}, [file.id, file.kind]);
	const open = async () => {
		try {
			setError("");
			const local = path || (await downloadAttachment(file.id));
			setPath(local);
			if (file.kind === "image") await Taro.previewImage({ urls: [local], current: local });
			else if (file.kind === "audio") {
				const audio = Taro.createInnerAudioContext();
				audio.src = local;
				audio.onEnded(() => audio.destroy());
				audio.onError(() => {
					audio.destroy();
					setError(t("音频播放失败", "Audio playback failed"));
				});
				audio.play();
			} else await Taro.openDocument({ filePath: local, showMenu: true });
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};
	return (
		<View className="mini-attachment" onClick={() => void open()}>
			{file.kind === "image" && path ? (
				<Image className="mini-message-image" mode="widthFix" src={path} />
			) : (
				<Text>
					{file.name} · {Math.ceil(file.size / 1024)} KB
				</Text>
			)}
			{error && (
				<Text className="mini-error">
					{error} · {t("点击重试", "Tap to retry")}
				</Text>
			)}
		</View>
	);
}
