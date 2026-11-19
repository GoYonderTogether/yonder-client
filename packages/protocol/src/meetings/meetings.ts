/** Long recordings are separate from short voice input; all media remains private. */
export type MeetingStatus =
	| "uploading"
	| "queued"
	| "transcribing"
	| "summarizing"
	| "delivering"
	| "completed"
	| "failed"
	| "unknown";
export type MeetingStage = "transcription" | "summary" | "delivery";
export type MeetingBatchState = "pending" | "processing" | "completed" | "failed" | "unknown";
export interface MeetingSegmentManifest {
	index: number;
	durationMs: number;
	byteLength: number;
}
export interface CreateMeetingRequest {
	clientRecordingId: string;
	conversationId: string;
	title: string;
	separateSpeakers?: boolean;
	/** Unix epoch milliseconds from the source recording. */
	startedAt: number;
	endedAt: number;
	state: "ended" | "interrupted";
	segments: MeetingSegmentManifest[];
}
export interface MeetingSegment extends MeetingSegmentManifest {
	uploaded: boolean;
}
export interface MeetingTranscriptBatch {
	index: number;
	firstSegment: number;
	lastSegment: number;
	state: MeetingBatchState;
	text: string | null;
	errorCode: string | null;
}
export interface MeetingRecord {
	id: string;
	clientRecordingId: string;
	conversationId: string;
	title: string;
	sourceState: "ended" | "interrupted";
	startedAt: number;
	endedAt: number;
	durationMs: number;
	uploadedDurationMs: number;
	status: MeetingStatus;
	segments: MeetingSegment[];
	batches: MeetingTranscriptBatch[];
	/** Completed batches in source order; batch coverage remains authoritative. */
	transcript: string;
	summary: string | null;
	summaryRunId: string | null;
	resultMessageId: string | null;
	failedStage: MeetingStage | null;
	errorCode: string | null;
}
export interface RetryMeetingRequest {
	/** Required only for an unknown external result that may already have incurred cost. */
	confirmUnknown?: boolean;
}
