import type { MemoryMaterial } from "@yonder/protocol";
import { cn } from "@yonder/ui-components";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PreviewFile } from "../../preview/file-kind.ts";
import { useAttachmentBlob } from "../../preview/use-attachment-blob.ts";
import { KIND_ICONS } from "./memory-format.ts";
import { attachmentFile } from "./memory-media.tsx";

/** A source inside an opened entry: an attachment opens in the reader, a web page in the browser. */
export function Material({
	material,
	onPreview,
	persistent,
}: {
	material: MemoryMaterial;
	onPreview: (file: PreviewFile) => void;
	persistent: boolean;
}) {
	const Icon = KIND_ICONS[material.kind];
	const content = (
		<>
			<i>
				<Icon aria-hidden />
			</i>
			<span>
				<b>{material.label}</b>
				{material.detail ? <small>{material.detail}</small> : null}
			</span>
			{material.attachment || material.url ? <ChevronRight aria-hidden /> : null}
		</>
	);
	const className = cn("memory-material", `memory-kind-${material.kind}`);
	if (material.attachment)
		return (
			<li>
				<AttachmentMaterial
					attachment={material.attachment}
					className={className}
					onPreview={onPreview}
					persistent={persistent}
				>
					{content}
				</AttachmentMaterial>
			</li>
		);
	if (material.url?.startsWith("https://"))
		return (
			<li>
				<a className={className} href={material.url} target="_blank" rel="noreferrer noopener">
					{content}
				</a>
			</li>
		);
	return (
		<li>
			<div className={className}>{content}</div>
		</li>
	);
}

function AttachmentMaterial({
	attachment,
	className,
	onPreview,
	persistent,
	children,
}: {
	attachment: NonNullable<MemoryMaterial["attachment"]>;
	className: string;
	onPreview: (file: PreviewFile) => void;
	persistent: boolean;
	children: React.ReactNode;
}) {
	const { t } = useTranslation();
	const blob = useAttachmentBlob(attachment, "original", persistent);
	return (
		<>
			<button
				type="button"
				className={className}
				aria-busy={blob.loading}
				onClick={async () => {
					const content = await blob.load();
					if (content) onPreview(attachmentFile(attachment, content));
				}}
			>
				{children}
			</button>
			{blob.error ? (
				<p role="alert" className="memory-error-line">
					{t("memory.openFailed")}
				</p>
			) : null}
		</>
	);
}
