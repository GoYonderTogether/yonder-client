import { recordingDuration } from "@yonder/feature-meetings";
import {
	formatMeetingTranscript,
	type MeetingPhoto,
	type MeetingRecord,
	type MeetingTranscriptBatch,
} from "@yonder/protocol";
import { Button, Segmented } from "@yonder/ui-components";
import { X } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MeetingArchiveImage } from "./item-meeting-photos.tsx";
import { renderMeetingArchiveSvg } from "./meeting-archive-svg.tsx";
import { MessageContent } from "./message-content.tsx";
import "./item-meeting-reader.css";

export function orderedPhotos(photos: MeetingRecord["photos"]): MeetingPhoto[] {
	return [...(photos ?? [])].sort((a, b) => a.elapsedMs - b.elapsedMs);
}

type Entry = { elapsedMs: number } & (
	| { kind: "batch"; batch: MeetingTranscriptBatch; endMs?: number | undefined }
	| { kind: "photo"; photo: MeetingPhoto }
);

/** Source IDs derive from recorded segment indices, never a mutable transcript offset. */
export function recordingEntries(meeting: MeetingRecord): Entry[] {
	const starts = new Map<number, number>();
	let elapsed = 0;
	const ends = new Map<number, number>();
	for (const segment of [...meeting.segments].sort((a, b) => a.index - b.index)) {
		starts.set(segment.index, elapsed);
		elapsed += segment.durationMs;
		ends.set(segment.index, elapsed);
	}
	const batches: Entry[] = meeting.batches
		.filter((batch) => batch.state === "completed" && batch.text?.trim())
		.map((batch) => ({
			kind: "batch",
			batch,
			elapsedMs: batch.startMs ?? starts.get(batch.firstSegment) ?? 0,
			endMs: batch.endMs ?? ends.get(batch.lastSegment),
		}));
	return [
		...batches,
		...orderedPhotos(meeting.photos).map((photo) => ({ kind: "photo" as const, photo, elapsedMs: photo.elapsedMs })),
	].sort((a, b) => a.elapsedMs - b.elapsedMs);
}

function entryId(entry: Entry) {
	return entry.kind === "batch" ? `batch-${entry.batch.firstSegment}` : `photo-${entry.photo.clientPhotoId}`;
}

type Paragraph = { id: string; time: string; speaker: string | null; text: string };

/**
 * One batch's stored transcript, read as the shared paragraphs. A batch is one ASR request, and its
 * speaker labels are local to it, so paragraphs never merge across batches — the same boundary the
 * live page keeps. `[mm:ss]` comes from the sentence itself, and an uncertain speaker shows nothing.
 */
export function batchParagraphs(batch: MeetingTranscriptBatch): Paragraph[] {
	const id = `batch-${batch.firstSegment}`;
	return formatMeetingTranscript(batch.text ?? "")
		.split("\n")
		.filter(Boolean)
		.map((line, index) => {
			const match = /^\[([0-9:]+)\] (?:说话人 (\d{1,3})：)?([\s\S]*)$/u.exec(line);
			return {
				id: `${id}-${index}`,
				time: match?.[1] ?? "",
				speaker: match?.[2] ? `说话人 ${match[2]}` : null,
				text: match?.[3] ?? line,
			};
		});
}

/** The paragraphs of every completed batch, in recording order. */
export function recordingParagraphs(
	meeting: MeetingRecord,
): { batch: MeetingTranscriptBatch; paragraphs: Paragraph[] }[] {
	return recordingEntries(meeting).flatMap((entry) =>
		entry.kind === "batch" ? [{ batch: entry.batch, paragraphs: batchParagraphs(entry.batch) }] : [],
	);
}

export function MeetingReader({
	meeting,
	title,
	mode,
	source,
	onOpen,
}: {
	meeting: MeetingRecord;
	title: string;
	mode: "notes" | "original";
	source: string | null;
	onOpen: (value: "notes" | "original" | null, source?: string) => void;
}) {
	const { t } = useTranslation();
	const dialog = useRef<HTMLDialogElement>(null);
	const heading = useId();
	const entries = recordingEntries(meeting);
	const photos = orderedPhotos(meeting.photos);
	// The 原文 tab reads the shared reading format (the same paragraphs the Bot reads through
	// `meeting_view`), with pictures kept at the batch boundaries where they were taken.
	const paragraphs = recordingParagraphs(meeting);
	const summary = meeting.summary?.trim();
	const shown = mode === "notes" && summary ? "notes" : "original";
	const available = entries.some((entry) => entryId(entry) === source);
	useLayoutEffect(() => {
		const node = dialog.current;
		if (!node) return;
		if (typeof node.showModal === "function") node.showModal();
		else node.setAttribute("open", "");
		return () => {
			if (typeof node.close === "function") node.close();
			else node.removeAttribute("open");
		};
	}, []);
	useLayoutEffect(() => {
		if (!source || !available || shown !== "original") return;
		const node = document.getElementById(source);
		if (!node || !dialog.current?.contains(node)) return;
		node?.focus({ preventScroll: true });
		node.scrollIntoView({ block: "start" });
	}, [source, shown, available]);
	return (
		<dialog
			ref={dialog}
			className="recording-reader"
			data-recording-reader
			aria-labelledby={heading}
			onCancel={(event) => {
				event.preventDefault();
				onOpen(null);
			}}
		>
			<header className="recording-reader-header">
				<h2 id={heading} className="min-w-0 flex-1 truncate text-h3 font-semibold">
					{title}
				</h2>
				<button
					type="button"
					aria-label={t("app.close")}
					className="flex size-[var(--control-md)] shrink-0 items-center justify-center rounded-[var(--radius-full)] hover:bg-[var(--color-bg-hover)]"
					onClick={() => onOpen(null)}
				>
					<X size={20} aria-hidden="true" />
				</button>
				<Segmented
					aria-label={t("meetingRecorder.name")}
					size="lg"
					options={[
						{ value: "notes", label: t("meetingRecorder.archiveNotes"), disabled: !summary },
						{ value: "original", label: t("meetingRecorder.archiveOriginal") },
					]}
					value={shown}
					onChange={(value) => onOpen(value === "notes" ? "notes" : "original")}
					className="col-span-full"
				/>
			</header>
			<div className="recording-reader-body" key={shown}>
				{shown === "notes" && summary ? (
					<MessageContent
						body={summary}
						sourceAction={(id) =>
							entries.some((entry) => entryId(entry) === id) ? () => onOpen("original", id) : undefined
						}
						renderCodeBlock={(lang, text) =>
							lang === "svg" ? renderMeetingArchiveSvg(text, t("meetingRecorder.archiveDiagram")) : null
						}
					/>
				) : (
					<>
						{!entries.some((entry) => entry.kind === "batch") ? (
							<p className="whitespace-pre-wrap wrap-anywhere">
								{meeting.transcript || t("meetingRecorder.archiveNoOriginal")}
							</p>
						) : null}
						{entries.map((entry) => {
							const time = recordingDuration(entry.elapsedMs);
							if (entry.kind === "batch") {
								const id = entryId(entry);
								const shown = paragraphs.find((group) => group.batch === entry.batch)?.paragraphs ?? [];
								return (
									<section key={id} id={id} tabIndex={-1} className="recording-reader-entry">
										{shown.map((paragraph) => (
											<p key={paragraph.id} className="whitespace-pre-wrap wrap-anywhere">
												{paragraph.time ? (
													<time className="tabular-nums text-[var(--color-text-secondary)]">{paragraph.time} </time>
												) : null}
												{paragraph.speaker ? `${paragraph.speaker}：` : null}
												{paragraph.text}
											</p>
										))}
									</section>
								);
							}
							const id = entryId(entry);
							const index = photos.indexOf(entry.photo);
							const before = photos[index - 1];
							const after = photos[index + 1];
							return (
								<figure key={id} id={id} tabIndex={-1} className="recording-reader-entry">
									<figcaption className="text-caption tabular-nums text-[var(--color-text-secondary)]">
										{t("meetingRecorder.archivePhoto", { time })}
									</figcaption>
									<MeetingArchiveImage meetingId={meeting.id} photo={entry.photo} lazy={source !== id} />
									{photos.length > 1 ? (
										<div className="flex justify-between gap-[var(--spacing-2)]">
											<Button
												variant="link"
												size="sm"
												disabled={!before}
												onClick={() => before && onOpen("original", `photo-${before.clientPhotoId}`)}
											>
												{t("meetingRecorder.archivePrevious")}
											</Button>
											<Button
												variant="link"
												size="sm"
												disabled={!after}
												onClick={() => after && onOpen("original", `photo-${after.clientPhotoId}`)}
											>
												{t("meetingRecorder.archiveNext")}
											</Button>
										</div>
									) : null}
								</figure>
							);
						})}
					</>
				)}
			</div>
		</dialog>
	);
}
