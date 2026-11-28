import { splitTextAttachment } from "@yonder/chat-model";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { decodeAttachmentText } from "../lib/attachment-text.ts";
import { MessageContent } from "../pages/message-content.tsx";
import type { PreviewFile } from "./file-kind.ts";
import { readLegacyWord } from "./legacy-word.ts";
import { usePreviewTranslation } from "./preview-i18n.ts";

export function TextPreview({ file, kind }: { file: PreviewFile; kind: "text" | "markdown" | "doc" }) {
	const t = usePreviewTranslation();
	const [text, setText] = useState<string>();
	const [partial, setPartial] = useState(false);
	const [error, setError] = useState(false);
	const [visiblePages, setVisiblePages] = useState(1);
	useEffect(() => {
		let active = true;
		const controller = new AbortController();
		setText(undefined);
		setError(false);
		setVisiblePages(1);
		setPartial(false);
		void (async () => {
			if (kind === "doc") {
				const result = await readLegacyWord(file.blob, controller.signal);
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
	}, [file.blob, kind]);
	const pages = useMemo(() => (text && kind !== "markdown" ? splitTextAttachment(text) : []), [kind, text]);
	return (
		<TextPreviewViewport
			onReachEnd={visiblePages < pages.length ? () => setVisiblePages((count) => count + 1) : undefined}
		>
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
					<MessageContent body={text} />
				</article>
			) : (
				<pre className="attachment-text-content">{pages.slice(0, visiblePages)}</pre>
			)}
		</TextPreviewViewport>
	);
}

/** The text reader requests more only when pending content nears its scroll viewport. */
export function TextPreviewViewport({
	children,
	onReachEnd,
}: {
	children: ReactNode;
	onReachEnd?: (() => void) | undefined;
}) {
	const scroll = useRef<HTMLDivElement>(null);
	const nextPage = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const root = scroll.current;
		const target = nextPage.current;
		if (!root || !target || !onReachEnd) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) onReachEnd();
			},
			{ root, rootMargin: "512px 0px" },
		);
		observer.observe(target);
		return () => observer.disconnect();
	}, [onReachEnd]);
	return (
		<div className="attachment-text-reader">
			<div ref={scroll} className="attachment-document-scroll">
				{children}
				{onReachEnd ? <div ref={nextPage} aria-hidden="true" /> : null}
			</div>
		</div>
	);
}
