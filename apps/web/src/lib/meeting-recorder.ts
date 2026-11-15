import type { MeetingRecorderState } from "@yonder/feature-meetings";
import { isContactWindow } from "./contact-window.ts";
import { isTauri } from "./keychain.ts";

export const EMPTY_RECORDER: MeetingRecorderState = { supported: false, activeId: null, recordings: [] };

export function meetingRecorderSupported(): boolean {
	return isTauri() && !isContactWindow();
}

export async function invokeMeetingRecorder<T>(command: string, args: Record<string, unknown>): Promise<T> {
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke<T>(`plugin:meeting-recorder|${command}`, args);
}

export async function resetMeetingRecorder(): Promise<void> {
	if (meetingRecorderSupported()) await invokeMeetingRecorder("set_owner", { ownerId: null });
}

export async function readMeetingAudio(
	ownerId: string,
	recordingId: string,
	segmentIndex: number,
): Promise<Uint8Array> {
	const bytes = await invokeMeetingRecorder<ArrayBuffer | number[]>("read_audio", {
		ownerId,
		recordingId,
		segmentIndex,
	});
	return new Uint8Array(bytes);
}
