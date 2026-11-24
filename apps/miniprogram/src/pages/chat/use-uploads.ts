import Taro from "@tarojs/taro";
import type { Attachment } from "@yonder/protocol";
import { useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { fitLocalImage } from "../../lib/local-image";
import { newNonce, uploadAttachment } from "../../lib/runtime";
import { uploadCancellation } from "./upload-cancel";

export type ChatUpload = {
	key: string;
	path: string;
	name: string;
	size: number;
	kind: "image" | "file";
	attachment?: Attachment;
	error?: string;
	uploading: boolean;
};
const maxBytes = 20 * 1024 * 1024;
export function useChatUploads(ownerId: string | undefined, conversationId: string) {
	const scope = `${ownerId ?? ""}:${conversationId}`;
	const currentScope = useRef(scope);
	const renderScope = useRef(scope);
	renderScope.current = scope;
	const active = useRef(true);
	const values = useRef<ChatUpload[]>([]);
	const tasks = useRef(new Map<string, ReturnType<typeof uploadCancellation>>());
	const [uploads, setUploads] = useState<ChatUpload[]>([]);
	const [error, setError] = useState("");
	const change = (next: ChatUpload[]) => {
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
			for (const task of tasks.current.values()) task.abort();
			tasks.current.clear();
		};
	}, [scope]);
	const upload = async (file: ChatUpload) => {
		if (tasks.current.has(file.key)) return;
		const expected = currentScope.current;
		const controller = uploadCancellation();
		tasks.current.set(file.key, controller);
		change(
			values.current.map((item) => (item.key === file.key ? { ...item, error: undefined, uploading: true } : item)),
		);
		try {
			const attachment = await uploadAttachment(file.path, file.key, controller.signal);
			if (
				active.current &&
				expected === currentScope.current &&
				expected === renderScope.current &&
				!controller.signal.aborted
			)
				change(
					values.current.map((item) => (item.key === file.key ? { ...item, attachment, uploading: false } : item)),
				);
		} catch {
			if (
				active.current &&
				expected === currentScope.current &&
				expected === renderScope.current &&
				!controller.signal.aborted
			)
				change(
					values.current.map((item) =>
						item.key === file.key
							? { ...item, uploading: false, error: t("上传失败，请重试", "Upload failed. Try again.") }
							: item,
					),
				);
		} finally {
			if (tasks.current.get(file.key) === controller) tasks.current.delete(file.key);
		}
	};
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
			const additions: ChatUpload[] = accepted.map((file) => ({ ...file, key: newNonce(), kind, uploading: true }));
			change([...values.current, ...additions]);
			for (const file of additions) void upload(file);
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
		tasks.current.get(key)?.abort();
		tasks.current.delete(key);
		change(values.current.filter((item) => item.key !== key));
	};
	return {
		uploads: currentScope.current === scope ? uploads : [],
		error: currentScope.current === scope ? error : "",
		addImages: () => add("image"),
		addFiles: () => add("file"),
		removeUpload,
		retryUpload: (key: string) => {
			const file = values.current.find((item) => item.key === key);
			if (file && !file.attachment) void upload(file);
		},
		clearSentUploads: (keys: string[]) => {
			const sent = new Set(keys);
			change(values.current.filter((item) => !sent.has(item.key)));
		},
	};
}
