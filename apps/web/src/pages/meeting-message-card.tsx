import { recordingDuration } from "@yonder/feature-meetings";
import type { Message } from "@yonder/protocol";
import { ChevronRight, ListTodo } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { RecordingNoteIcon } from "../app/recording-note-icon.tsx";
import { recordingNoteDate, recordingNoteDuration } from "./meeting-message-summary.ts";

export function MeetingMessageCard({
	meeting,
	task = false,
	onOpen,
}: {
	meeting: NonNullable<Message["meeting"]>;
	/** A task session entry uses the same row with its own icon and label. */
	task?: boolean;
	onOpen: (id: string) => void;
}) {
	const { t, i18n } = useTranslation();
	const detailsId = useId();
	const title = task ? meeting.title : meeting.title.trim() || t("meetingRecorder.defaultTitle");
	const date = task ? null : recordingNoteDate(meeting.startedAt, i18n.resolvedLanguage);
	const duration = task ? null : recordingNoteDuration(meeting.durationMs);
	const details = [date, duration ? t(`meetingRecorder.card${duration.unit}`, duration) : null]
		.filter(Boolean)
		.join(" · ");
	return (
		<button
			type="button"
			data-meeting-task-card
			aria-describedby={details ? detailsId : undefined}
			aria-label={t(task ? "chat.openTaskSession" : "meetingRecorder.openResult", { title })}
			onClick={() => onOpen(meeting.id)}
			className="flex min-h-[var(--control-lg)] w-full max-w-[calc(var(--control-lg)*7)] items-center gap-[var(--spacing-3)] rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-raised)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-start text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
		>
			{task ? (
				<ListTodo aria-hidden="true" size={20} className="shrink-0 text-[var(--color-accent-text)]" />
			) : (
				<RecordingNoteIcon aria-hidden="true" className="shrink-0" />
			)}
			<span className="min-w-0 flex-1 text-body font-medium">
				<span className="block truncate">{title}</span>
				{task ? (
					<MeetingMetadata {...meeting} />
				) : details ? (
					<span
						id={detailsId}
						className="block truncate text-caption font-normal tabular-nums text-[var(--color-text-secondary)]"
					>
						{details}
					</span>
				) : null}
			</span>
			<ChevronRight aria-hidden="true" size={18} className="shrink-0 text-[var(--color-text-secondary)]" />
		</button>
	);
}

export function MeetingMetadata({
	startedAt,
	endedAt,
	durationMs,
	photoCount,
}: {
	startedAt?: number | undefined;
	endedAt?: number | undefined;
	durationMs?: number | undefined;
	photoCount?: number | undefined;
}) {
	const { t, i18n } = useTranslation();
	const start = startedAt != null && startedAt > 0 && startedAt <= 8.64e15 ? new Date(startedAt) : null;
	const end = endedAt != null && endedAt > 0 && endedAt <= 8.64e15 ? new Date(endedAt) : null;
	const range = start ? meetingRange(start, end, i18n.resolvedLanguage) : null;
	const fields = [
		range,
		typeof durationMs === "number" && Number.isFinite(durationMs) ? recordingDuration(durationMs) : null,
		typeof photoCount === "number" && Number.isSafeInteger(photoCount) && photoCount >= 0
			? t("meetingRecorder.archivePhotoCount", { count: photoCount })
			: null,
	].filter(Boolean);
	return fields.length ? (
		<span className="block text-caption tabular-nums text-[var(--color-text-secondary)]">{fields.join(" · ")}</span>
	) : null;
}

function meetingRange(start: Date, end: Date | null, locale: string | undefined) {
	const sameDay = start.toDateString() === end?.toDateString();
	const withSeconds = sameDay && start.getHours() === end?.getHours() && start.getMinutes() === end.getMinutes();
	const time = new Intl.DateTimeFormat(locale, {
		hour: "2-digit",
		minute: "2-digit",
		...(withSeconds ? { second: "2-digit" } : {}),
	});
	const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
	const from = `${date.format(start)} ${time.format(start)}`;
	return end ? `${from} – ${sameDay ? "" : `${date.format(end)} `}${time.format(end)}` : from;
}
