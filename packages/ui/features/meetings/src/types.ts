export type MeetingTransportMode = "live" | "record";

export interface MeetingRecording {
	id: string;
	ownerId: string;
	title: string;
	conversationId?: string | null;
	separateSpeakers?: boolean;
	transportMode?: MeetingTransportMode;
	state: "recording" | "ended" | "interrupted";
	startedAt: number;
	endedAt: number | null;
	/** Wall-clock time of the last durable write; the web recorder cannot know when a closed page stopped. */
	savedAt?: number;
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
	start(
		title: string,
		conversationId?: string,
		separateSpeakers?: boolean,
		transportMode?: MeetingTransportMode,
	): Promise<void>;
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
