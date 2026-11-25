import { recordingDuration } from "@yonder/feature-meetings";
import { Button } from "@yonder/ui-components";
import { useMeeting } from "@yonder/ui-data";
import { ChevronRight } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { MeetingArchiveImage } from "./item-meeting-photos.tsx";
import { MeetingReader, orderedPhotos } from "./item-meeting-reader.tsx";
import {
	recordingNoteDate,
	recordingNoteDuration,
	recordingNoteProgress,
	recordingNoteTimeRange,
} from "./meeting-message-summary.ts";

export function ItemMeetingCard({ id, title }: { id: string; title: string }) {
	const { t, i18n } = useTranslation();
	const detailsId = useId();
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
	const topic = title.trim() || meeting?.topic?.trim() || meeting?.title.trim() || t("meetingRecorder.defaultTitle");
	const date = recordingNoteDate(meeting?.startedAt, i18n.resolvedLanguage);
	const duration = recordingNoteDuration(meeting?.durationMs);
	const details = [date, duration ? t(`meetingRecorder.card${duration.unit}`, duration) : null]
		.filter(Boolean)
		.join(" · ");
	const time = recordingNoteTimeRange(meeting?.startedAt, meeting?.endedAt, i18n.resolvedLanguage);
	const brief = meeting?.brief?.trim();
	// While the transcript is still being recognized, the card states how far it has got — the same
	// batches and percentage the Bot reads, so neither side can claim a progress the other lacks.
	const progress = meeting ? recordingNoteProgress(meeting.progress) : null;
	return (
		<div
			data-item-recording
			className="ms-auto w-full max-w-[calc(var(--control-lg)*8)] min-w-0 rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)]"
		>
			{meeting ? (
				<button
					type="button"
					aria-label={t("meetingRecorder.openResult", { title: topic })}
					aria-describedby={brief || details || time ? detailsId : undefined}
					onClick={() => open(meeting.summary?.trim() ? "notes" : "original")}
					className="flex min-h-[var(--control-lg)] w-full items-start gap-[var(--spacing-2)] rounded-[var(--radius-card)] px-[var(--spacing-4)] py-[var(--spacing-3)] text-start hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
				>
					<span className="flex min-w-0 flex-1 flex-col gap-[var(--spacing-1)]">
						<span className="line-clamp-2 break-words text-body font-semibold">{topic}</span>
						{brief || details || time ? (
							<span id={detailsId} className="flex flex-col gap-[var(--spacing-2)]">
								{brief ? (
									<span className="line-clamp-2 break-words text-caption text-[var(--color-text-secondary)]">
										{brief}
									</span>
								) : null}
								{details || time ? (
									<span className="flex flex-col gap-x-[var(--spacing-3)] text-caption tabular-nums text-[var(--color-text-secondary)] sm:flex-row sm:flex-wrap sm:items-baseline">
										{details ? <span>{details}</span> : null}
										{time ? <span>{time}</span> : null}
									</span>
								) : null}
								{progress ? (
									<span role="status" className="text-caption tabular-nums text-[var(--color-text-secondary)]">
										{t("meetingRecorder.transcriptProgress", {
											completed: progress.completedBatches,
											total: progress.totalBatches,
											percent: progress.percent,
										})}
									</span>
								) : null}
							</span>
						) : null}
					</span>
					<ChevronRight
						aria-hidden="true"
						className="size-[var(--icon-md)] shrink-0 text-[var(--color-text-secondary)]"
					/>
				</button>
			) : (
				<div className="min-w-0 px-[var(--spacing-4)] py-[var(--spacing-3)]">
					<span className="block truncate text-body font-medium">{topic}</span>
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
				<div
					className="mb-[var(--spacing-3)] flex flex-wrap items-center gap-[var(--spacing-2)] px-[var(--spacing-4)]"
					data-recording-photos
				>
					{photos.slice(0, 3).map((photo) => (
						<button
							key={photo.clientPhotoId}
							type="button"
							aria-label={t("meetingRecorder.archivePhoto", { time: recordingDuration(photo.elapsedMs) })}
							onClick={() => open("original", `photo-${photo.clientPhotoId}`)}
							className="flex size-[var(--control-lg)] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-raised)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
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
