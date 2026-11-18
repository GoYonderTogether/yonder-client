export interface MeetingRecording {
	id: string;
	ownerId: string;
	title: string;
	conversationId?: string | null;
	separateSpeakers?: boolean;
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
	paused?: boolean;
	pauseSupported?: boolean;
	/** Peak absolute microphone amplitude, normalized to 0–1. */
	audioLevel?: number;
	recordings: MeetingRecording[];
}

export interface MeetingRecorderController {
	state: MeetingRecorderState;
	ready: boolean;
	busy: boolean;
	error: string | null;
	start(title: string, conversationId?: string, separateSpeakers?: boolean): Promise<void>;
	stop(recordingId: string): Promise<void>;
	pause?(recordingId: string): Promise<void>;
	resume?(recordingId: string): Promise<void>;
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
