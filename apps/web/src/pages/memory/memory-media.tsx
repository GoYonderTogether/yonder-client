import type { Attachment, MemoryMedia } from "@yonder/protocol";
import { cn } from "@yonder/ui-components";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useObjectUrl } from "../../lib/use-object-url.ts";
import { useVideoPoster } from "../../lib/use-video-poster.ts";
import type { PreviewFile } from "../../preview/file-kind.ts";
import { useAttachmentBlob } from "../../preview/use-attachment-blob.ts";
import { memoryFormat } from "./memory-format.ts";

/** Fetches the bytes once the thumbnail comes near the screen, then hands them to the reader on tap. */
function useNearScreen<T extends Element>() {
	const ref = useRef<T>(null);
	const [near, setNear] = useState(false);
	useEffect(() => {
		const element = ref.current;
		if (!element || near) return;
		if (typeof IntersectionObserver === "undefined") return setNear(true);
		const observer = new IntersectionObserver(
			(entries) => entries.some((entry) => entry.isIntersecting) && setNear(true),
			{
				rootMargin: "400px",
			},
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [near]);
	return { ref, near };
}

/**
 * One photo or video frame. Decorative inside an entry's button (the entry's title names it);
 * inside an opened entry it becomes its own button that opens the reader.
 */
export function MemoryThumb({
	media,
	more = 0,
	onOpen,
	className,
}: {
	media: MemoryMedia;
	more?: number;
	onOpen?: ((file: PreviewFile) => void) | undefined;
	className?: string;
}) {
	const { ref, near } = useNearScreen<HTMLSpanElement>();
	const blob = useAttachmentBlob(media.attachment);
	const video = media.attachment.mimeType.startsWith("video/");
	const poster = useVideoPoster(video ? blob.blob : undefined);
	const url = useObjectUrl(video ? poster : blob.blob);
	const { load } = blob;
	useEffect(() => {
		if (near) void load();
	}, [near, load]);
	const body = (
		<>
			{url ? <img src={url} alt="" draggable={false} /> : null}
			{media.durationMs != null ? (
				<span className="memory-thumb-video">
					<Play size={10} aria-hidden />
					{memoryFormat.duration(media.durationMs)}
				</span>
			) : null}
			{more > 0 ? <span className="memory-thumb-more">+{more}</span> : null}
		</>
	);
	const classes = cn("memory-thumb", blob.error && "memory-thumb-failed", className);
	if (!onOpen)
		return (
			<span ref={ref} className={classes} aria-hidden>
				{body}
			</span>
		);
	return (
		<button
			type="button"
			ref={ref as React.Ref<HTMLButtonElement>}
			className={classes}
			aria-label={media.attachment.name}
			onClick={async () => {
				const content = blob.blob ?? (await load());
				if (content) onOpen(attachmentFile(media.attachment, content));
			}}
		>
			{body}
		</button>
	);
}

export const attachmentFile = (attachment: Attachment, blob: Blob): PreviewFile => ({
	id: attachment.id,
	name: attachment.name,
	mimeType: attachment.mimeType,
	blob,
});
