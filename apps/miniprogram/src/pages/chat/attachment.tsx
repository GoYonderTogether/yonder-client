import { Image, Button as NativeButton, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { AttachmentTile } from "@yonder/chat-presentation";
import type { Attachment } from "@yonder/protocol";
import { useEffect, useState } from "react";
import { useVisibleImage } from "../../components/visible-image";
import { t } from "../../lib/i18n";
import { downloadAttachment, downloadAttachmentImage, useSession } from "../../lib/runtime";
import { ChatView } from "./host";

export function MessageAttachment({
	file,
	timeline,
	onSizeChange,
}: {
	file: Attachment;
	timeline?: boolean;
	onSizeChange?: () => void;
}) {
	const [loaded, setLoaded] = useState<{ fileId: string; owner: string; path: string }>();
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [previewing, setPreviewing] = useState(false);
	const { memberId } = useSession();
	const { id: fileId, kind, name } = file;
	const image = kind === "image";
	const path = loaded && loaded.owner === memberId && loaded.fileId === fileId ? loaded.path : "";
	const { id, visible } = useVisibleImage(image, timeline ? undefined : ".mini-message-list");
	useEffect(() => {
		if (!image || !visible || !memberId) return;
		let active = true;
		setError("");
		setLoading(true);
		void downloadAttachmentImage({ id: fileId, kind, name }, "thumb")
			.then((value) => {
				if (active) setLoaded({ fileId, owner: memberId, path: value });
			})
			.catch(() => {
				if (active) setError(t("下载失败，请重试", "Download failed. Try again."));
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [fileId, image, kind, memberId, name, visible]);
	const open = async () => {
		try {
			setError("");
			setPreviewing(true);
			const local = image ? await downloadAttachmentImage(file, "original") : await downloadAttachment(file.id);
			if (image) await Taro.previewImage({ urls: [local], current: local });
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
			setPreviewing(false);
		}
	};
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
				disabled={previewing || loading || undefined}
				onClick={() => void open()}
			>
				{image ? (
					<View id={id}>
						{path ? (
							<Image className="message-attachment-image" mode="aspectFit" src={path} onLoad={onSizeChange} />
						) : (
							<View className="message-attachment-image mini-chat-attachment-placeholder">
								<Text>{error ? t("点击重试", "Tap to retry") : t("正在加载…", "Loading…")}</Text>
							</View>
						)}
					</View>
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
