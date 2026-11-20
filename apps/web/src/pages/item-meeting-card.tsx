import { recordingDuration } from "@yonder/feature-meetings";
import { Button } from "@yonder/ui-components";
import { useMeeting } from "@yonder/ui-data";
import { ChevronDown, FileAudio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MessageContent } from "./message-content.tsx";
import { messagePreview } from "./message-preview.ts";

export function ItemMeetingCard({ id }: { id: string }) {
	const { t } = useTranslation();
	const query = useMeeting(id);
	const meeting = query.data;
	const transcript = meeting?.transcript.trim();
	const summary = meeting?.summary?.trim();
	return (
		<div
			data-item-recording
			className="ms-auto w-full max-w-[calc(var(--control-lg)*8)] min-w-0 rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-accent-subtle)] px-[var(--spacing-4)] py-[var(--spacing-3)] text-[var(--color-text-primary)]"
		>
			<div className="flex items-center gap-[var(--spacing-3)]">
				<span className="flex size-[var(--control-md)] shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-bg-surface)] text-[var(--color-accent-text)]">
					<FileAudio size={20} aria-hidden="true" />
				</span>
				<div className="min-w-0 flex-1">
					<p className="text-body font-medium">{t("tasks.itemRecording")}</p>
					{meeting ? (
						<p className="text-caption tabular-nums text-[var(--color-text-secondary)]">
							{recordingDuration(meeting.durationMs)}
						</p>
					) : null}
				</div>
			</div>
			{query.isPending ? (
				<p role="status" className="mt-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)]">
					{t("app.loading")}
				</p>
			) : null}
			{query.isError && !meeting ? (
				<div className="mt-[var(--spacing-2)] flex items-center justify-between gap-[var(--spacing-2)] text-caption">
					<span role="alert">{t("meetingRecorder.processingFailed")}</span>
					<Button variant="link" size="sm" onClick={() => void query.refetch()}>
						{t("app.retry")}
					</Button>
				</div>
			) : null}
			{summary ? (
				<p className="mt-[var(--spacing-2)] line-clamp-2 text-caption text-[var(--color-text-secondary)]">
					{messagePreview(summary)}
				</p>
			) : null}
			{transcript || summary ? (
				<details className="group mt-[var(--spacing-3)] border-t border-[var(--color-border-subtle)]">
					<summary className="flex min-h-[var(--control-sm)] cursor-pointer list-none items-center justify-between gap-[var(--spacing-2)] pt-[var(--spacing-2)] text-caption font-medium [&::-webkit-details-marker]:hidden">
						{t(transcript ? "tasks.itemTranscript" : "tasks.itemRecordingSummary")}
						<ChevronDown size={16} aria-hidden="true" className="shrink-0 group-open:rotate-180" />
					</summary>
					<div className="mt-[var(--spacing-3)] flex flex-col gap-[var(--spacing-3)] text-body">
						{summary ? <MessageContent body={summary} /> : null}
						{transcript ? <p className="whitespace-pre-wrap wrap-anywhere">{transcript}</p> : null}
					</div>
				</details>
			) : null}
		</div>
	);
}
