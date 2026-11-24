import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { MeetingPhoto } from "../lib/meeting-photos.ts";
import { useObjectUrl } from "../lib/use-object-url.ts";
import { liveRecordingTimeline, type liveTranscriptEntries } from "./live-transcript.ts";

export function MeetingTimeline({
	transcript,
	photos,
	onPhotoOpen,
}: {
	transcript: ReturnType<typeof liveTranscriptEntries>;
	photos: MeetingPhoto[];
	onPhotoOpen: (id: string, button: HTMLButtonElement) => void;
}) {
	const { t } = useTranslation();
	const items = useMemo(() => liveRecordingTimeline(transcript, photos), [transcript, photos]);
	const latest = items.findLast((entry) => entry.kind === "speech");
	return items.map((entry) =>
		entry.kind === "photo" ? (
			<Photo key={entry.photo.id} photo={entry.photo} onOpen={onPhotoOpen} />
		) : (
			<div className="meeting-transcript-entry" key={entry.index} data-current={entry === latest || undefined}>
				{entry.timing ? (
					<div className="meeting-transcript-meta">
						<time>
							{t("meetingRecorder.liveElapsedSeconds", {
								seconds: Math.floor(entry.timing.startMs / 1000),
							})}
						</time>
						{entry.timing.speaker ? <span>{t("meetingRecorder.liveSpeaker", entry.timing.speaker)}</span> : null}
					</div>
				) : null}
				<p>
					{(entry.turns ?? [entry]).map((turn, index) => (
						<span key={turn.index} data-transcript-start-ms={turn.timing?.startMs}>
							{index ? " " : ""}
							{turn.text}
						</span>
					))}
				</p>
			</div>
		),
	);
}

function Photo({ photo, onOpen }: { photo: MeetingPhoto; onOpen: (id: string, button: HTMLButtonElement) => void }) {
	const { t } = useTranslation();
	const url = useObjectUrl(photo.image);
	const time = t("meetingRecorder.liveElapsedSeconds", { seconds: Math.floor(photo.elapsedMs / 1000) });
	return (
		<figure className="meeting-transcript-entry">
			<time>{time}</time>
			{url ? (
				<button
					type="button"
					className="meeting-transcript-photo"
					onClick={(event) => onOpen(photo.id, event.currentTarget)}
				>
					<img src={url} alt={t("meetingRecorder.cameraPhoto", { time })} />
				</button>
			) : null}
		</figure>
	);
}
