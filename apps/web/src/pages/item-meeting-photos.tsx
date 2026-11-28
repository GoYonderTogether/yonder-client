import { recordingDuration } from "@yonder/feature-meetings";
import type { MeetingPhoto } from "@yonder/protocol";
import { useApi } from "@yonder/ui-data";
import { Image } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useObjectUrl } from "../lib/use-object-url.ts";
import { useImageBlob } from "../preview/use-image-blob.ts";

export function MeetingArchiveImage({
	meetingId,
	photo,
	thumb = false,
	lazy = false,
	original = false,
}: {
	meetingId: string;
	photo: MeetingPhoto;
	thumb?: boolean;
	lazy?: boolean;
	original?: boolean;
}) {
	const api = useApi();
	const { t } = useTranslation();
	const photoId = photo.clientPhotoId;
	const variant = original ? "original" : "thumb";
	const { blob, error, load } = useImageBlob(
		useMemo(
			() => ({
				resource: { meetingId, photoId },
				variant,
				sign: () => api.meetingPhotoDownload(meetingId, photoId, variant),
				local: () => api.meetingPhoto(meetingId, photoId),
			}),
			[api, meetingId, photoId, variant],
		),
	);
	const url = useObjectUrl(blob);
	const placeholder = useRef<HTMLSpanElement>(null);
	const [visible, setVisible] = useState(false);
	useEffect(() => {
		if (!lazy || visible || !placeholder.current) return;
		if (typeof IntersectionObserver !== "function") {
			setVisible(true);
			return;
		}
		const observer = new IntersectionObserver((entries) => {
			if (entries.some(({ isIntersecting }) => isIntersecting)) setVisible(true);
		});
		observer.observe(placeholder.current);
		return () => observer.disconnect();
	}, [lazy, visible]);
	useEffect(() => {
		if (!lazy || visible) void load();
	}, [load, lazy, visible]);
	if (!url && thumb)
		return (
			<span ref={placeholder}>
				<Image size={18} aria-hidden="true" className="text-[var(--color-accent-text)]" />
			</span>
		);
	if (!url)
		return (
			<span ref={placeholder} role={error ? "alert" : "status"} className="text-caption">
				{t(error ? "meetingRecorder.archivePhotoFailed" : "app.loading")}
			</span>
		);
	return (
		<img
			src={url}
			alt={thumb ? "" : t("meetingRecorder.archivePhoto", { time: recordingDuration(photo.elapsedMs) })}
			className={
				thumb
					? "size-full object-cover"
					: "max-h-[calc(var(--control-lg)*6)] w-full rounded-[var(--radius-control)] object-contain"
			}
		/>
	);
}
