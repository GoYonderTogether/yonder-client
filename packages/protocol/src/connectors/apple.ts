/**
 * The Apple connectors' own operations and results (`apple-calendar`, `apple-photos`, `apple-notes`,
 * `apple-voice-memos`), in their own module because `connectors.ts` is already near its length
 * limit and they share no types with the file and terminal families beyond `Attachment`.
 */

import type { Attachment } from "../chat/chat.ts";

export type AppleConnectorOperation =
	| "apple_calendar_list"
	| "apple_calendar_read"
	| "apple_photos_list"
	| "apple_photos_read"
	| "apple_photos_image"
	| "apple_notes_list"
	| "apple_notes_read"
	| "apple_notes_attachment_read"
	| "apple_voice_memos_list"
	| "apple_voice_memos_read"
	| "apple_voice_memos_transcribe";

export interface AppleSourceIdentity {
	globalId?: string;
	contentSha256?: string;
}

export interface AppleNoteAttachment {
	id: string;
	name: string;
	mimeType: string;
	size?: number;
}

export interface AppleCalendarEvent {
	id: string;
	title: string;
	startsAt: string;
	endsAt: string;
	allDay: boolean;
	calendar: string;
	sourceIdentity?: AppleSourceIdentity;
}

export type AppleConnectorResult =
	| { kind: "apple_calendar_list"; events: AppleCalendarEvent[]; more: boolean }
	| {
			kind: "apple_calendar_read";
			event: AppleCalendarEvent & { notes?: string; location?: string; url?: string };
	  }
	| {
			kind: "apple_photos_list";
			photos: {
				id: string;
				createdAt: string | null;
				width: number;
				height: number;
				sourceIdentity?: AppleSourceIdentity;
			}[];
			more: boolean;
	  }
	| {
			kind: "apple_photos_read";
			id: string;
			text: string;
			truncated?: boolean;
			labels?: string[];
			/** Which local copy the text came from: the original on the device, or the system thumbnail. */
			source?: "local" | "thumbnail";
	  }
	/** `view` asked for one photo's picture; carries the normalized copy, never the original. */
	| { kind: "apple_photos_image"; id: string; attachment: Attachment }
	| {
			kind: "apple_notes_list";
			notes: { id: string; title: string; modifiedAt: string | null; sourceIdentity?: AppleSourceIdentity }[];
			more: boolean;
	  }
	| {
			kind: "apple_notes_read";
			id: string;
			text: string;
			truncated?: boolean;
			attachments?: AppleNoteAttachment[];
			moreAttachments?: boolean;
	  }
	| { kind: "apple_notes_attachment_read"; id: string; attachmentId: string; attachment: Attachment }
	| {
			kind: "apple_voice_memos_list";
			recordings: {
				id: string;
				title: string;
				createdAt: string | null;
				durationMs: number | null;
				sourceIdentity?: AppleSourceIdentity;
			}[];
			more: boolean;
	  }
	| { kind: "apple_voice_memos_read"; id: string; attachment: Attachment }
	| { kind: "apple_voice_memos_transcribe"; id: string; text: string };

export type AppleConnectorId = "apple-calendar" | "apple-photos" | "apple-notes" | "apple-voice-memos";
