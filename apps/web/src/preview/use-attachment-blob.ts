import type { Attachment } from "@yonder/protocol";
import { chatCacheGeneration, loadMedia, type MediaVariant, useApi, usePerson } from "@yonder/ui-data";
import { useMemo } from "react";
import { useMediaBlob } from "./use-media-blob.ts";

export function useAttachmentBlob(attachment: Attachment, variant: MediaVariant = "original", persistent = true) {
	const api = useApi();
	const owner = usePerson()?.id;
	const { id, kind } = attachment;
	const mime = attachment.mimeType.toLowerCase();
	const image = mime.startsWith("image/") && mime !== "image/svg+xml";
	const spec = image ? variant : "original";
	const result = useMediaBlob(
		useMemo(
			() => ({
				resource: { attachmentId: id },
				variant: spec,
				kind: image ? "image" : kind === "audio" ? "audio" : undefined,
				persistent,
				sign: () => api.attachmentDownload(id, spec),
				local: () => api.attachmentContent(id),
			}),
			[api, id, image, kind, spec, persistent],
		),
	);

	return {
		...result,
		async loadPart(part: Attachment) {
			if (part.id === id) return result.load();
			if (!owner) return;
			const generation = chatCacheGeneration();
			const content = await loadMedia(
				owner,
				{ attachmentId: part.id },
				"original",
				{
					sign: () => api.attachmentDownload(part.id, "original"),
					local: () => api.attachmentContent(part.id),
					kind: "audio",
				},
				persistent,
			);
			return generation === chatCacheGeneration() ? content?.blob : undefined;
		},
	};
}
