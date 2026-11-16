import type { MeetingRecord } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MeetingCloudController } from "./types.ts";

export function MeetingProcessing({
	meeting,
	cloud,
	renderSummary,
}: {
	meeting: MeetingRecord;
	cloud: MeetingCloudController;
	renderSummary?: (text: string) => ReactNode;
}) {
	const { t } = useTranslation();
	const [confirmUnknown, setConfirmUnknown] = useState(false);
	const latest = meeting.transcript
		.trim()
		.split(/(?<=[。！？.!?])\s*/u)
		.filter(Boolean)
		.slice(-3)
		.join(" ");
	return (
		<section className="flex flex-col gap-[var(--spacing-2)]" aria-label={t("meetingRecorder.progress")}>
			<p role="status" className="text-caption text-[var(--color-text-secondary)]">
				{t(`meetingRecorder.processing.${meeting.status}`)}
			</p>
			{meeting.errorCode === "meeting_transcript_too_large" ? (
				<p role="alert" className="text-caption">
					{t("meetingRecorder.transcriptTooLarge")}
				</p>
			) : null}
			{meeting.sourceState === "interrupted" ? (
				<p className="text-caption">{t("meetingRecorder.partialResult")}</p>
			) : null}
			{meeting.status === "uploading" ? (
				<progress
					className="w-full"
					max={meeting.durationMs || 1}
					value={meeting.uploadedDurationMs}
					aria-label={t("meetingRecorder.uploadProgress")}
				/>
			) : null}
			{latest ? (
				<div>
					<h4 className="text-caption font-medium">{t("meetingRecorder.latestTranscript")}</h4>
					<p className="whitespace-pre-wrap break-words text-body">{latest}</p>
				</div>
			) : null}
			{meeting.transcript ? (
				<details className="text-caption">
					<summary className="cursor-pointer">{t("meetingRecorder.fullTranscript")}</summary>
					<p className="mt-[var(--spacing-2)] whitespace-pre-wrap break-words text-body">{meeting.transcript}</p>
				</details>
			) : null}
			{meeting.summary ? (
				<div className="min-w-0 break-words text-body">
					<h4 className="mb-[var(--spacing-2)] text-caption font-medium">{t("meetingRecorder.summary")}</h4>
					{renderSummary ? renderSummary(meeting.summary) : <p className="whitespace-pre-wrap">{meeting.summary}</p>}
				</div>
			) : null}
			{meeting.status === "unknown" ? (
				<label className="flex items-start gap-[var(--spacing-2)] text-caption">
					<input
						type="checkbox"
						checked={confirmUnknown}
						onChange={(event) => setConfirmUnknown(event.target.checked)}
					/>
					{t("meetingRecorder.confirmUnknown")}
				</label>
			) : null}
			{(meeting.status === "failed" && meeting.errorCode !== "meeting_transcript_too_large") ||
			meeting.status === "unknown" ? (
				<Button
					size="sm"
					disabled={cloud.busy || (meeting.status === "unknown" && !confirmUnknown)}
					onClick={() => void cloud.retry(meeting.id, confirmUnknown)}
				>
					{t("app.retry")}
				</Button>
			) : null}
		</section>
	);
}
