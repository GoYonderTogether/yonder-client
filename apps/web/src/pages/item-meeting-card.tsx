import { recordingDuration } from "@yonder/feature-meetings";
import { Button } from "@yonder/ui-components";
import { useMeeting } from "@yonder/ui-data";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { MeetingArchiveImage } from "./item-meeting-photos.tsx";
import { MeetingReader, orderedPhotos } from "./item-meeting-reader.tsx";
import { MeetingMetadata } from "./meeting-message-card.tsx";

export function ItemMeetingCard({ id, title }: { id: string; title: string }) {
	const { t } = useTranslation();
	const query = useMeeting(id);
	const meeting = query.data;
	const [params, setParams] = useSearchParams();
	const location = useLocation();
	const navigate = useNavigate();
	const mode = params.get("recording");
	const openedHere = location.state?.recordingOpenedHere === true;
	function open(value: "notes" | "original" | null, source?: string) {
		if (!value && openedHere) {
			navigate(-1);
			return;
		}
		setParams(
			(current) => {
				const next = new URLSearchParams(current);
				if (value) next.set("recording", value);
				else next.delete("recording");
				if (source) next.set("source", source);
				else next.delete("source");
				return next;
			},
			{ replace: Boolean(mode), state: mode ? location.state : { ...location.state, recordingOpenedHere: true } },
		);
	}
	const photos = orderedPhotos(meeting?.photos);
	const topic = title || meeting?.topic?.trim() || meeting?.title || t("meetingRecorder.name");
	return (
		<div
			data-item-recording
			className="ms-auto w-full max-w-[calc(var(--control-lg)*8)] min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-accent-subtle)] text-[var(--color-text-primary)]"
		>
			{meeting ? (
				<button
					type="button"
					aria-label={t("meetingRecorder.openResult", { title: topic })}
					onClick={() => open(meeting.summary?.trim() ? "notes" : "original")}
					className="flex min-h-[var(--control-lg)] w-full items-center gap-[var(--spacing-3)] px-[var(--spacing-4)] py-[var(--spacing-3)] text-start"
				>
					<span className="min-w-0 flex-1">
						{meeting.brief?.trim() ? (
							<span className="mb-[var(--spacing-1)] block truncate text-body font-medium">{meeting.brief}</span>
						) : null}
						<MeetingMetadata {...meeting} photoCount={meeting.photos?.length} />
					</span>
					<ChevronRight size={18} aria-hidden="true" className="shrink-0 text-[var(--color-accent-text)]" />
				</button>
			) : (
				<div className="px-[var(--spacing-4)] py-[var(--spacing-3)]">
					{query.isError ? (
						<div className="flex items-center justify-between gap-[var(--spacing-2)] text-caption">
							<span role="alert">{t("meetingRecorder.processingFailed")}</span>
							<Button variant="link" size="sm" onClick={() => void query.refetch()}>
								{t("app.retry")}
							</Button>
						</div>
					) : (
						<p role="status" className="text-caption">
							{t("app.loading")}
						</p>
					)}
				</div>
			)}
			{photos.length ? (
				<div className="mb-[var(--spacing-3)] flex items-center px-[var(--spacing-4)]" data-recording-photos>
					{photos.slice(0, 3).map((photo, index) => (
						<button
							key={photo.clientPhotoId}
							type="button"
							aria-label={t("meetingRecorder.archivePhoto", { time: recordingDuration(photo.elapsedMs) })}
							onClick={() => open("original", `photo-${photo.clientPhotoId}`)}
							className={`flex size-[var(--control-lg)] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-bg-surface)] bg-[var(--color-bg-raised)] hover:z-10 focus-visible:z-10 ${index ? "-ms-[var(--spacing-2)]" : ""}`}
						>
							<MeetingArchiveImage meetingId={id} photo={photo} thumb />
						</button>
					))}
					{photos[3] ? (
						<Button size="sm" variant="link" onClick={() => open("original", `photo-${photos[3]?.clientPhotoId}`)}>
							+{photos.length - 3}
						</Button>
					) : null}
				</div>
			) : null}
			{meeting && (mode === "notes" || mode === "original") ? (
				<MeetingReader meeting={meeting} title={topic} mode={mode} source={params.get("source")} onOpen={open} />
			) : null}
		</div>
	);
}
