import { Image, Button as NativeButton, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { AttachmentTile } from "@yonder/chat-presentation";
import type { Attachment } from "@yonder/protocol";
import { useEffect, useState } from "react";
import { t } from "../../lib/i18n";
import { downloadAttachment } from "../../lib/runtime";
import { ChatView } from "./host";

export function MessageAttachment({ file, onSizeChange }: { file: Attachment; onSizeChange?: () => void }) {
	const [path, setPath] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	useEffect(() => {
		let active = true;
		if (file.kind === "image") {
			setLoading(true);
			void downloadAttachment(file.id)
				.then((value) => {
					if (active) setPath(value);
				})
				.catch(() => {
					if (active) setError(t("下载失败，请重试", "Download failed. Try again."));
				})
				.finally(() => {
					if (active) setLoading(false);
				});
		}
		return () => {
			active = false;
		};
	}, [file.id, file.kind]);
	const open = async () => {
		try {
			setError("");
			setLoading(true);
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
		} catch {
			setError(t("下载失败，请重试", "Download failed. Try again."));
		} finally {
			setLoading(false);
		}
	};
	const image = file.kind === "image";
	const extension = file.name.split(".").at(-1)?.toUpperCase() || file.mimeType;
	return (
		<AttachmentTile as={ChatView} id={file.id}>
			<NativeButton
				className={`message-attachment-open ${image ? "message-attachment-media" : "message-attachment-file"}`}
				ariaLabel={
					error
						? t("附件下载失败，点击重试", "Attachment download failed, tap to retry")
						: `${t("打开附件", "Open attachment")} ${file.name}`
				}
				disabled={loading ? true : undefined}
				onClick={() => void open()}
			>
				{image ? (
					path ? (
						<Image className="message-attachment-image" mode="aspectFit" src={path} onLoad={onSizeChange} />
					) : (
						<View className="message-attachment-image mini-chat-attachment-placeholder">
							<Text>{loading ? t("正在加载…", "Loading…") : t("点击重试", "Tap to retry")}</Text>
						</View>
					)
				) : (
					<>
						<View className="message-attachment-caption">
							<Text className="message-attachment-name">{file.name}</Text>
							<Text className="message-attachment-caption-size">
								{error
									? `${t("下载失败", "Download failed")} · ${t("重试", "Retry")}`
									: `${extension} · ${Math.ceil(file.size / 1024)} KB`}
							</Text>
						</View>
						<View className="message-attachment-icon">
							<Text>{extension.slice(0, 3)}</Text>
						</View>
					</>
				)}
			</NativeButton>
			{error && image ? (
				<View className="message-attachment-error" role="alert">
					<Text className="mini-error">
						{error} · {t("点击重试", "Tap to retry")}
					</Text>
				</View>
			) : null}
		</AttachmentTile>
	);
}
