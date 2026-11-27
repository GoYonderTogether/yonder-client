import { useEffect, useRef, useState } from "react";
import { useObjectUrl } from "../lib/use-object-url.ts";
import type { PreviewFile } from "./file-kind.ts";
import { usePreviewTranslation } from "./preview-i18n.ts";

export function MediaPreview({
	file,
	kind,
	pauseWhenHidden = false,
}: {
	file: PreviewFile;
	kind: "audio" | "video";
	pauseWhenHidden?: boolean;
}) {
	const t = usePreviewTranslation();
	const ref = useRef<HTMLMediaElement>(null);
	const [error, setError] = useState(false);
	const url = useObjectUrl(file.blob);
	useEffect(() => {
		if (!url) return;
		setError(false);
		const element = ref.current;
		return () => {
			element?.pause();
			element?.removeAttribute("src");
			element?.load();
		};
	}, [url]);
	useEffect(() => {
		const element = ref.current;
		if (!element || !pauseWhenHidden) return;
		const observer = new IntersectionObserver(([entry]) => {
			if (entry && !entry.isIntersecting && !element.paused) element.pause();
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [pauseWhenHidden]);
	return (
		<div className="attachment-media-reader">
			{kind === "audio" ? (
				// biome-ignore lint/a11y/useMediaCaption: arbitrary uploaded media has no associated captions available.
				<audio
					ref={ref as React.RefObject<HTMLAudioElement>}
					controls
					src={url || undefined}
					preload="metadata"
					onError={() => setError(true)}
				/>
			) : (
				// biome-ignore lint/a11y/useMediaCaption: arbitrary uploaded media has no associated captions available.
				<video
					ref={ref as React.RefObject<HTMLVideoElement>}
					controls
					playsInline
					src={url || undefined}
					preload="metadata"
					onError={() => setError(true)}
				/>
			)}
			{error ? <p role="status">{t("mediaFailed")}</p> : null}
		</div>
	);
}
