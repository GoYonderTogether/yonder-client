import type { MeetingRecorderState } from "@yonder/feature-meetings";
import { browserMeetingCommand, browserMeetingSupported } from "./browser-meeting-recorder.ts";
import { isContactWindow } from "./contact-window.ts";
import { isTauri } from "./keychain.ts";

export const EMPTY_RECORDER: MeetingRecorderState = { supported: false, activeId: null, recordings: [] };

export function meetingRecorderSupported(): boolean {
	return isTauri() ? !isContactWindow() : browserMeetingSupported();
}

export async function invokeMeetingRecorder<T>(command: string, args: Record<string, unknown>): Promise<T> {
	if (!isTauri()) return (await browserMeetingCommand(command, args)) as T;
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
	const bytes = await invokeMeetingRecorder<ArrayBuffer | number[] | Uint8Array>("read_audio", {
		ownerId,
		recordingId,
		segmentIndex,
	});
	return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}
