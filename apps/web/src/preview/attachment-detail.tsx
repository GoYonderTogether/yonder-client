import type { Attachment } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { useOptionalSidePanel } from "@yonder/ui-shell";
import { ICON_SIZE } from "@yonder/ui-tokens";
import { FileText, Film, Image, Music } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AttachmentReader, type ImageNavigation } from "./attachment-preview.tsx";
import { type PreviewFile, previewKind } from "./file-kind.ts";
import { usePreviewTranslation } from "./preview-i18n.ts";

type FetchableAttachment = Attachment & { load: () => Promise<Blob | undefined> };

export function useOpenAttachmentDetail() {
	const side = useOptionalSidePanel();
	return (file: PreviewFile | FetchableAttachment, imageNavigation?: ImageNavigation): boolean => {
		if (!side || !file.id) return false;
		side.open({
			key: `attachment:${file.id}`,
			title: file.name,
			icon: <AttachmentIcon file={file} />,
			content: <AttachmentDetail file={file} imageNavigation={imageNavigation} />,
		});
		return true;
	};
}

function AttachmentIcon({ file }: { file: PreviewFile | FetchableAttachment }) {
	const kind = previewKind({ name: file.name, mimeType: file.mimeType });
	const Icon = kind === "image" ? Image : kind === "video" ? Film : kind === "audio" ? Music : FileText;
	return <Icon size={ICON_SIZE.sm} aria-hidden="true" />;
}

function AttachmentDetail({
	file,
	imageNavigation,
}: {
	file: PreviewFile | FetchableAttachment;
	imageNavigation?: ImageNavigation | undefined;
}) {
	const { t } = useTranslation();
	const label = usePreviewTranslation();
	const supplied = "blob" in file ? file.blob : undefined;
	const load = "load" in file ? file.load : undefined;
	const [loaded, setLoaded] = useState<Blob | null>(() => supplied ?? null);
	const [attempt, setAttempt] = useState(0);
	const [failedAttempt, setFailedAttempt] = useState<number>();
	useEffect(() => {
		if (loaded) return;
		if (supplied) {
			setLoaded(supplied);
			return;
		}
		if (!load) return;
		let active = true;
		void load().then(
			(content) => {
				if (!active) return;
				if (content) setLoaded(content);
				else setFailedAttempt(attempt);
			},
			() => {
				if (active) setFailedAttempt(attempt);
			},
		);
		return () => {
			active = false;
		};
	}, [loaded, supplied, load, attempt]);
	const blob = loaded ?? supplied;
	if (blob) return <AttachmentReader file={{ ...file, blob }} imageNavigation={imageNavigation} />;
	return (
		<div className="attachment-reader-notice" role="status">
			{failedAttempt === attempt ? (
				<>
					<p>{t("chat.attachmentFailed")}</p>
					<Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
						{t("app.retry")}
					</Button>
				</>
			) : (
				label("loading")
			)}
		</div>
	);
}
