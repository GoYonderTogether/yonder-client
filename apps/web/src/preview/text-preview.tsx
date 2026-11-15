import { useApi } from "@yonder/ui-data";
import { useEffect, useState } from "react";
import { decodeAttachmentText } from "../lib/attachment-text.ts";
import { MessageContent } from "../pages/message-content.tsx";
import type { PreviewFile } from "./file-kind.ts";
import { usePreviewTranslation } from "./preview-i18n.ts";

export function TextPreview({ file, kind }: { file: PreviewFile; kind: "text" | "markdown" | "doc" }) {
	const api = useApi();
	const t = usePreviewTranslation();
	const [text, setText] = useState<string>();
	const [partial, setPartial] = useState(false);
	const [error, setError] = useState(false);
	const [offset, setOffset] = useState(0);
	const chunk = 32_000;
	useEffect(() => {
		let active = true;
		const controller = new AbortController();
		setText(undefined);
		setError(false);
		setOffset(0);
		setPartial(false);
		void (async () => {
			if (kind === "doc") {
				const result = file.id
					? await api.attachmentPreviewText(file.id, controller.signal)
					: await api.previewAttachmentText(
							new File([file.blob], file.name, { type: file.mimeType }),
							controller.signal,
						);
				if (active) {
					setText(result.text);
					setPartial(result.truncated);
				}
			} else {
				const bytes = new Uint8Array(await file.blob.arrayBuffer());
				const value = decodeAttachmentText(bytes);
				if (active) setText(value);
			}
		})().catch(() => {
			if (active) setError(true);
		});
		return () => {
			active = false;
			controller.abort();
		};
	}, [file, kind, api]);
	const shown = text?.slice(offset, offset + chunk);
	return (
		<div className="attachment-text-reader">
			{(text?.length ?? 0) > chunk ? (
				<div className="attachment-reader-toolbar">
					<button type="button" disabled={!offset} onClick={() => setOffset((value) => Math.max(0, value - chunk))}>
						{t("textPrevious")}
					</button>
					<span>
						{t("textRange", {
							start: offset + 1,
							end: Math.min(text?.length ?? 0, offset + chunk),
							count: text?.length ?? 0,
						})}
					</span>
					<button
						type="button"
						disabled={offset + chunk >= (text?.length ?? 0)}
						onClick={() => setOffset((value) => value + chunk)}
					>
						{t("textNext")}
					</button>
				</div>
			) : null}
			<div className="attachment-document-scroll">
				{partial ? <p role="status">{t("partial")}</p> : null}
				{error ? (
					<p className="attachment-reader-notice" role="status">
						{t("failed")}
					</p>
				) : text === undefined ? (
					<p role="status" className="attachment-reader-notice">
						{t("loading")}
					</p>
				) : kind === "markdown" ? (
					<article className="attachment-document-content">
						<MessageContent body={shown ?? ""} />
					</article>
				) : (
					<pre className="attachment-text-content">{shown}</pre>
				)}
			</div>
		</div>
	);
}
