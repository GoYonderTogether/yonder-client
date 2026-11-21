import { recordingDuration } from "@yonder/feature-meetings";
import type { Message } from "@yonder/protocol";
import { ChevronRight, FileAudio } from "lucide-react";
import { useTranslation } from "react-i18next";

export function MeetingMessageCard({
	meeting,
	onOpen,
}: {
	meeting: NonNullable<Message["meeting"]>;
	onOpen: (id: string) => void;
}) {
	const { t } = useTranslation();
	return (
		<button
			type="button"
			data-meeting-task-card
			aria-label={t("meetingRecorder.openResult", { title: meeting.title })}
			onClick={() => onOpen(meeting.id)}
			className="flex min-h-[var(--control-lg)] w-full max-w-[calc(var(--control-lg)*7)] items-center gap-[var(--spacing-3)] rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-raised)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-start text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
		>
			<FileAudio aria-hidden="true" size={20} className="shrink-0 text-[var(--color-accent-text)]" />
			<span className="min-w-0 flex-1">
				<span className="block truncate text-body font-medium">{meeting.title}</span>
				<MeetingMetadata {...meeting} />
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
