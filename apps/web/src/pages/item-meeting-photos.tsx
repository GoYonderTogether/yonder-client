import { recordingDuration } from "@yonder/feature-meetings";
import type { MeetingPhoto } from "@yonder/protocol";
import { useApi } from "@yonder/ui-data";
import { Image } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useObjectUrl } from "../lib/use-object-url.ts";

export function MeetingArchiveImage({
	meetingId,
	photo,
	thumb = false,
	lazy = false,
}: {
	meetingId: string;
	photo: MeetingPhoto;
	thumb?: boolean;
	lazy?: boolean;
}) {
	const api = useApi();
	const { t } = useTranslation();
	const [blob, setBlob] = useState<Blob>();
	const [failed, setFailed] = useState(false);
	const url = useObjectUrl(blob);
	const placeholder = useRef<HTMLParagraphElement>(null);
	const [visible, setVisible] = useState(false);
	const load = !lazy || visible;
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
		if (!load) return;
		const controller = new AbortController();
		void api.meetingPhoto(meetingId, photo.clientPhotoId, controller.signal).then(
			(value) => {
				if (!controller.signal.aborted) setBlob(value);
			},
			() => {
				if (!controller.signal.aborted) setFailed(true);
			},
		);
		return () => controller.abort();
	}, [api, meetingId, photo.clientPhotoId, load]);
	if (!url && thumb) return <Image size={18} aria-hidden="true" className="text-[var(--color-accent-text)]" />;
	if (!url)
		return (
			<p ref={placeholder} role={failed ? "alert" : "status"} className="text-caption">
				{t(failed ? "meetingRecorder.archivePhotoFailed" : "app.loading")}
			</p>
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
