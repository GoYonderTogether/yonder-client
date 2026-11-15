export interface MeetingRecording {
	id: string;
	ownerId: string;
	title: string;
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
	start(title: string): Promise<void>;
	stop(recordingId: string): Promise<void>;
	reload(): Promise<void>;
	readAudio(recordingId: string, segmentIndex: number): Promise<Uint8Array>;
}
