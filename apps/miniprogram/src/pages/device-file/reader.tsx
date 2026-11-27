import { Image, Text, Video, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { Button, State } from "../../components/ui";
import { type DeviceFile, decodeFileText } from "../../lib/device-file-bytes";
import { t } from "../../lib/i18n";
import { newNonce } from "../../lib/runtime";
import { MessageBody } from "../chat/markdown";

const imageTypes = /^image\/(?:png|jpeg|gif|webp|bmp)$/i;
const documentTypes = /^(?:pdf|docx?|xlsx?|pptx?)$/i;
const sourceTypes = /^(?:md|markdown|txt|json|csv|yaml|yml|log)$/i;

export function DeviceFileBody({ file }: { file: DeviceFile }) {
	const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
	if (file.bytes.byteLength <= 1024 * 1024 && (file.mime.startsWith("text/") || sourceTypes.test(extension))) {
		try {
			const body = decodeFileText(file.bytes);
			return /^(md|markdown)$/.test(extension) || file.mime === "text/markdown" ? (
				<MessageBody body={body} />
			) : (
				<Text selectable userSelect className="mini-device-file-text">
					{body}
				</Text>
			);
		} catch {
			// A file with invalid UTF-8 still has the original verified bytes.
		}
	}
	return <DeviceMedia file={file} extension={extension} />;
}

function DeviceMedia({ file, extension }: { file: DeviceFile; extension: string }) {
	const h5 = process.env.TARO_ENV === "h5";
	const image = imageTypes.test(file.mime);
	const video = file.mime.startsWith("video/");
	const audio = file.mime.startsWith("audio/");
	const documentFile = documentTypes.test(extension);
	const supported = h5 || image || video || audio || documentFile;
	const [path, setPath] = useState("");
	const [error, setError] = useState("");
	const audioContext = useRef<ReturnType<typeof Taro.createInnerAudioContext>>();
	useEffect(() => () => audioContext.current?.destroy(), []);
	useEffect(() => {
		if (!supported) return;
		if (h5) {
			const url = URL.createObjectURL(new Blob([file.bytes], { type: file.mime }));
			setPath(url);
			return () => URL.revokeObjectURL(url);
		}
		const fs = Taro.getFileSystemManager();
		const suffix = /^[a-z0-9]{1,16}$/.test(extension) ? `.${extension}` : "";
		const filePath = `${Taro.env.USER_DATA_PATH}/yonder-preview-${newNonce()}${suffix}`;
		let active = true;
		const clean = () => fs.unlink({ filePath, fail() {} });
		fs.writeFile({
			filePath,
			data: file.bytes,
			success: () => {
				if (active) setPath(filePath);
				else clean();
			},
			fail: () => {
				if (active) setError(t("文件无法预览", "The file could not be previewed"));
			},
		});
		return () => {
			active = false;
			clean();
		};
	}, [extension, file, h5, supported]);

	if (!supported) return <State empty={t("请在桌面客户端打开这种文件", "Open this file type in the desktop app")} />;
	if (!path) return <State loading={!error} error={error || undefined} />;
	if (image) return <Image className="mini-device-image" src={path} mode="widthFix" />;
	if (video) return <Video className="mini-device-image" src={path} />;
	const playOrOpen = async () => {
		setError("");
		if (audio) {
			const context = audioContext.current ?? Taro.createInnerAudioContext();
			audioContext.current = context;
			context.src = path;
			context.play();
		} else if (h5) {
			const link = globalThis.document.createElement("a");
			link.href = path;
			link.download = file.name;
			link.click();
		} else {
			try {
				await Taro.openDocument({ filePath: path, showMenu: true });
			} catch {
				setError(t("文件无法预览", "The file could not be previewed"));
			}
		}
	};
	return (
		<View>
			<Button secondary onClick={() => void playOrOpen()}>
				{audio ? t("播放", "Play") : h5 ? t("下载文件", "Download file") : t("打开文件", "Open file")}
			</Button>
			{error ? <State error={error} /> : null}
		</View>
	);
}
