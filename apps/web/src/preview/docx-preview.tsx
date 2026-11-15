import DOMPurify from "dompurify";
import { convertToHtml } from "mammoth";
import { useEffect, useState } from "react";
import { validateDocxSize } from "./docx-size.ts";

export { validateDocxSize } from "./docx-size.ts";

import type { PreviewFile } from "./file-kind.ts";
import { usePreviewTranslation } from "./preview-i18n.ts";

export function sanitizeDocument(html: string): string {
	const fragment = DOMPurify.sanitize(html, {
		ALLOWED_TAGS: [
			"p",
			"br",
			"h1",
			"h2",
			"h3",
			"h4",
			"h5",
			"h6",
			"strong",
			"em",
			"b",
			"i",
			"u",
			"s",
			"sup",
			"sub",
			"a",
			"img",
			"table",
			"thead",
			"tbody",
			"tfoot",
			"tr",
			"th",
			"td",
			"caption",
			"ul",
			"ol",
			"li",
			"blockquote",
			"pre",
			"code",
			"hr",
			"span",
			"div",
		],
		ALLOWED_ATTR: ["href", "src", "alt", "title", "colspan", "rowspan", "id"],
		RETURN_DOM_FRAGMENT: true,
		FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input", "link", "meta"],
		FORBID_ATTR: ["style", "srcset"],
	});
	for (const image of fragment.querySelectorAll("img")) {
		if (!/^data:image\/(png|jpe?g|gif|webp|bmp|avif);base64,/i.test(image.getAttribute("src") ?? ""))
			image.removeAttribute("src");
	}
	for (const link of fragment.querySelectorAll("a")) {
		if (!/^(https?:|mailto:|#)/i.test(link.getAttribute("href") ?? "")) link.removeAttribute("href");
		link.setAttribute("target", "_blank");
		link.setAttribute("rel", "noopener noreferrer");
	}
	const container = document.createElement("div");
	container.append(fragment);
	return container.innerHTML;
}

export default function DocxPreview({ file }: { file: PreviewFile }) {
	const t = usePreviewTranslation();
	const [html, setHtml] = useState<string>();
	const [error, setError] = useState<"failed" | "tooLarge">();
	useEffect(() => {
		let active = true;
		setHtml(undefined);
		setError(undefined);
		void file.blob
			.arrayBuffer()
			.then(async (arrayBuffer) => {
				validateDocxSize(arrayBuffer);
				const result = await convertToHtml({ arrayBuffer }, { externalFileAccess: false });
				if (active) setHtml(sanitizeDocument(result.value));
			})
			.catch((failure: unknown) => {
				if (active) setError(failure instanceof Error && failure.message === "docx_too_large" ? "tooLarge" : "failed");
			});
		return () => {
			active = false;
		};
	}, [file.blob]);
	return (
		<div className="attachment-document-scroll">
			<p className="attachment-reader-kind">{t("semantic")}</p>
			{error ? (
				<p role="status" className="attachment-reader-notice">
					{t(error)}
				</p>
			) : html === undefined ? (
				<p role="status" className="attachment-reader-notice">
					{t("loading")}
				</p>
			) : (
				// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitizeDocument removes unsafe markup and URLs before rendering.
				<article className="attachment-document-content" dangerouslySetInnerHTML={{ __html: html }} />
			)}
		</div>
	);
}
