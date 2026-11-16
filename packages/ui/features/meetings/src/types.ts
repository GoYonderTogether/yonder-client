import type { MeetingRecord } from "@yonder/protocol";

export interface MeetingRecording {
	id: string;
	ownerId: string;
	title: string;
	conversationId?: string | null;
	state: "recording" | "ended" | "interrupted";
	startedAt: number;
	endedAt: number | null;
	durationMs: number;
	savedDurationMs: number;
	sampleRate: number;
	channels: number;
	segments: { index: number; durationMs: number; byteLength: number }[];
	error: string | null;
}

export interface MeetingRecorderState {
	supported: boolean;
	activeId: string | null;
	recordings: MeetingRecording[];
}

export interface MeetingRecorderController {
	state: MeetingRecorderState;
	ready: boolean;
	busy: boolean;
	error: string | null;
	start(title: string, conversationId?: string): Promise<void>;
	stop(recordingId: string): Promise<void>;
	reload(): Promise<void>;
	readAudio(recordingId: string, segmentIndex: number): Promise<Uint8Array>;
}

export interface MeetingUploadJob {
	recordingId: string;
	conversationId: string;
	meetingId: string | null;
	state: "queued" | "uploading" | "submitted" | "failed" | "authentication_required";
	errorCode: string | null;
}

export interface MeetingCloudController {
	records: MeetingRecord[];
	selected: MeetingRecord | undefined;
	jobs: MeetingUploadJob[];
	loading: boolean;
	error: boolean;
	busy: boolean;
	uploadAvailable: boolean;
	targetName: string | null;
	select(id: string | null): void;
	prepare(recordingId: string): Promise<void>;
	retry(id: string, confirmUnknown: boolean): Promise<void>;
	reload(): void;
}
