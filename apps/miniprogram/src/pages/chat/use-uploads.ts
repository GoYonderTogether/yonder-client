import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import type { LocalChatFile } from "../../lib/chat-outbox";
import { t } from "../../lib/i18n";
import { fitLocalImage } from "../../lib/local-image";
import { newNonce } from "../../lib/runtime";

const maxBytes = 20 * 1024 * 1024;
export function useChatUploads(ownerId: string | undefined, conversationId: string) {
	const scope = `${ownerId ?? ""}:${conversationId}`;
	const currentScope = useRef(scope);
	const renderScope = useRef(scope);
	renderScope.current = scope;
	const active = useRef(true);
	const values = useRef<LocalChatFile[]>([]);
	const [uploads, setUploads] = useState<LocalChatFile[]>([]);
	const [error, setError] = useState("");
	const change = (next: LocalChatFile[]) => {
		if (currentScope.current !== renderScope.current) return;
		values.current = next;
		setUploads(next);
	};
	useEffect(() => {
		active.current = true;
		currentScope.current = scope;
		values.current = [];
		setUploads([]);
		setError("");
		return () => {
			active.current = false;
		};
	}, [scope]);
	const add = async (kind: "image" | "file") => {
		const expected = currentScope.current;
		const remaining = 10 - values.current.length;
		if (!remaining || !ownerId || !conversationId) return;
		setError("");
		try {
			const files =
				kind === "image"
					? (
							await Taro.chooseMedia({
								count: Math.min(9, remaining),
								mediaType: ["image"],
								sourceType: ["album", "camera"],
							})
						).tempFiles.map((file) => ({
							path: file.tempFilePath,
							name: file.originalFileObj?.name || file.tempFilePath.split("/").at(-1) || t("图片", "Image"),
							size: file.size,
						}))
					: (await Taro.chooseMessageFile({ count: Math.min(100, remaining), type: "file" })).tempFiles.map((file) => ({
							path: file.path,
							name: file.name,
							size: file.size,
						}));
			const current = () => active.current && expected === currentScope.current && expected === renderScope.current;
			if (!current()) return;
			if (kind === "image") {
				for (const file of files) {
					if (file.size <= maxBytes) continue;
					const fitted = await fitLocalImage(file, maxBytes, 2048);
					if (!current()) return;
					file.path = fitted.path;
					file.size = fitted.size ?? file.size;
				}
			}
			const accepted = files.filter((file) => file.size <= maxBytes).slice(0, 10 - values.current.length);
			if (accepted.length !== files.length)
				setError(t("最多选择10个文件，每个不超过20 MiB", "Choose up to 10 files, each no larger than 20 MiB"));
			const additions: LocalChatFile[] = accepted.map((file) => ({ ...file, key: newNonce(), kind }));
			change([...values.current, ...additions]);
		} catch (e) {
			if (
				!(e as { errMsg?: string })?.errMsg?.includes("cancel") &&
				active.current &&
				expected === currentScope.current &&
				expected === renderScope.current
			)
				setError(t("选择文件失败，请重试", "Could not select files. Try again."));
		}
	};
	const removeUpload = (key: string) => {
		change(values.current.filter((item) => item.key !== key));
	};
	return {
		uploads: currentScope.current === scope ? uploads : [],
		error: currentScope.current === scope ? error : "",
		addImages: () => add("image"),
		addFiles: () => add("file"),
		removeUpload,
		clearSentUploads: (keys: string[]) => {
			const sent = new Set(keys);
			change(values.current.filter((item) => !sent.has(item.key)));
		},
	};
}
