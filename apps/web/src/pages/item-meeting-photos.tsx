import { recordingDuration } from "@yonder/feature-meetings";
import type { MeetingRecord } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { useApi } from "@yonder/ui-data";
import { Image } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useObjectUrl } from "../lib/use-object-url.ts";

export function ItemMeetingPhotos({
	meetingId,
	photos,
}: {
	meetingId: string;
	photos: NonNullable<MeetingRecord["photos"]>;
}) {
	const { t } = useTranslation();
	const [selected, setSelected] = useState<string>();
	const ordered = [...photos].sort((a, b) => a.elapsedMs - b.elapsedMs);
	const active = ordered.find((photo) => photo.clientPhotoId === selected);
	const label = (elapsedMs: number) => t("meetingRecorder.archivePhoto", { time: recordingDuration(elapsedMs) });
	return (
		<div className="mt-[var(--spacing-3)] flex flex-col gap-[var(--spacing-2)]">
			<div className="flex flex-wrap gap-[var(--spacing-2)]">
				{ordered.map((photo) => (
					<Button
						key={photo.clientPhotoId}
						variant="secondary"
						size="sm"
						aria-expanded={photo === active}
						onClick={() =>
							setSelected((current) => (current === photo.clientPhotoId ? undefined : photo.clientPhotoId))
						}
					>
						<Image aria-hidden="true" size={16} />
						{label(photo.elapsedMs)}
					</Button>
				))}
			</div>
			{active ? (
				<MeetingPhotoPreview
					key={active.clientPhotoId}
					meetingId={meetingId}
					photoId={active.clientPhotoId}
					label={label(active.elapsedMs)}
				/>
			) : null}
		</div>
	);
}

function MeetingPhotoPreview({ meetingId, photoId, label }: { meetingId: string; photoId: string; label: string }) {
	const api = useApi();
	const { t } = useTranslation();
	const [blob, setBlob] = useState<Blob>();
	const [failed, setFailed] = useState(false);
	const url = useObjectUrl(blob);
	useEffect(() => {
		const controller = new AbortController();
		void api.meetingPhoto(meetingId, photoId, controller.signal).then(
			(value) => {
				if (!controller.signal.aborted) setBlob(value);
			},
			() => {
				if (!controller.signal.aborted) setFailed(true);
			},
		);
		return () => controller.abort();
	}, [api, meetingId, photoId]);
	if (failed)
		return (
			<p role="alert" className="text-caption">
				{t("meetingRecorder.archivePhotoFailed")}
			</p>
		);
	if (!url)
		return (
			<p role="status" className="text-caption">
				{t("app.loading")}
			</p>
		);
	return (
		<img
			src={url}
			alt={label}
			className="max-h-[calc(var(--control-lg)*6)] w-full rounded-[var(--radius-control)] object-contain"
		/>
	);
}
