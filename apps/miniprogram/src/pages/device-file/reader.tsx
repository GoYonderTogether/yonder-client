import { Image, Text, Video, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { isTextAttachment, splitTextAttachment } from "@yonder/chat-model";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, State } from "../../components/ui";
import { type DeviceFile, decodeFileText } from "../../lib/device-file-bytes";
import { t } from "../../lib/i18n";
import { newNonce } from "../../lib/runtime";
import { MessageBody } from "../chat/markdown";

const imageTypes = /^image\/(?:png|jpeg|gif|webp|bmp)$/i;
const documentTypes = /^(?:pdf|docx?|xlsx?|pptx?)$/i;

interface TextSection {
	offset: number;
	text: string;
}

export function DeviceFileBody({ file }: { file: DeviceFile }) {
	const { name, mime, bytes } = file;
	const extension = name.split(".").at(-1)?.toLowerCase() ?? "";
	const parts = useMemo(() => {
		if (!isTextAttachment(name, mime)) return null;
		try {
			const body = decodeFileText(bytes);
			if (body.includes("\0")) return null;
			let offset = 0;
			return splitTextAttachment(body, 8192).map((text) => {
				const part = { offset, text };
				offset += text.length;
				return part;
			});
		} catch {
			return null;
		}
	}, [bytes, mime, name]);
	if (parts) {
		const markdown = /^(md|markdown)$/.test(extension) || mime === "text/markdown";
		if (markdown && parts.length <= 1) return <MessageBody body={parts[0]?.text ?? ""} />;
		return <DeviceText parts={parts} />;
	}
	return <DeviceMedia file={file} extension={extension} />;
}

function DeviceText({ parts }: { parts: TextSection[] }) {
	const reactId = useId();
	const [count, setCount] = useState(1);
	const more = count < parts.length;
	const tail = `device-text-tail-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}-${count}`;
	useEffect(() => {
		if (!more) return;
		const page = Taro.getCurrentInstance().page;
		if (!page) return;
		let active = true;
		let observer: Taro.IntersectionObserver | undefined;
		Taro.nextTick(() => {
			if (!active) return;
			observer = Taro.createIntersectionObserver(page, { thresholds: [0, 0.01] });
			observer.relativeToViewport({ bottom: 400 }).observe(`#${tail}`, ({ intersectionRatio }) => {
				if (!active || !intersectionRatio) return;
				active = false;
				observer?.disconnect();
				setCount(count + 1);
			});
		});
		return () => {
			active = false;
			observer?.disconnect();
		};
	}, [count, more, tail]);
	return (
		<View className="mini-device-file-text">
			{parts.slice(0, count).map(({ offset, text }) => (
				<Text key={offset} selectable userSelect>
					{text}
				</Text>
			))}
			{more ? <View id={tail} className="mini-device-file-text-tail" ariaHidden /> : null}
		</View>
	);
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
		if (file.localPath) {
			setPath(file.localPath);
			return;
		}
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
