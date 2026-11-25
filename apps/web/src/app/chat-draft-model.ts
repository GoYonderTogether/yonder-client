import type { Attachment } from "@yonder/protocol";
import { ApiError } from "@yonder/ui-data";
import { canPrepareLargeImage, isImageFile, type PreparedImage } from "../lib/prepare-image.ts";
import type { CompletionBinding } from "./completion/bindings.ts";
import { type PresetDraft, takePreset, withPreset } from "./draft-preset.ts";

/** One attachment in a draft, from picking it through to the server's record of it. */
export interface DraftFile {
	id: string;
	name: string;
	mimeType: string;
	blob: Blob;
	status: "ready" | "preparing" | "uploading" | "failed";
	uploaded?: Attachment;
	optimized?: PreparedImage | undefined;
	imagePrepared?: boolean;
	imageError?: boolean;
	sendOriginal?: boolean;
	/** Null while a recorded message for a Bot still needs transcription. */
	voiceTranscript?: string | null;
}

/** The whole draft for one conversation: what the field holds, what it would send, and its version. */
export interface Draft {
	text: string;
	files: DraftFile[];
	clientNonce?: string | undefined;
	revision: number;
	bindings?: CompletionBinding[];
}

export const emptyDraft = (): Draft => ({ text: "", files: [], revision: 0 });

/** A draft just loaded: a preset aimed at this chat applies now, if the draft is still empty. */
export function withPresetFor(key: string, draft: Draft): Draft {
	const phrase = takePreset(key, draft as PresetDraft);
	return phrase ? (withPreset(draft as PresetDraft, phrase) as Draft) : draft;
}

export function selectedDraftFile(file: DraftFile) {
	if (file.optimized && !file.sendOriginal) return { ...file.optimized, original: false };
	return { blob: file.blob, name: file.name, mimeType: file.mimeType, nonce: file.id, original: true };
}

/**
 * The message key for a refused send. A visit refusal and a quota refusal are real answers from
 * the server, so they replace the generic "your draft is preserved" line; anything else, including
 * a network failure, keeps that line because the draft really is preserved.
 */
const SEND_REFUSAL_KEYS = new Set(["visit_limit", "visit_denied", "visit_cap"]);

/**
 * A dissolved group, or a chat the sender was removed from, refuses every send with one code: the
 * composer says exactly that, in the members wording, instead of the generic "draft preserved" line
 * (19 3.2). It is a real refusal from the server, never drawn as something the Bot said.
 */
const CONVERSATION_CLOSED_KEY = "members.errors.conversationClosed";

export class AttachmentTooLargeError extends Error {}

export function sendErrorMessageKey(error: unknown): string {
	if (error instanceof AttachmentTooLargeError) return "chat.fileTooLarge";
	if (!(error instanceof ApiError)) return "chat.sendPreserved";
	if (error.code === "conversation_closed") return CONVERSATION_CLOSED_KEY;
	return SEND_REFUSAL_KEYS.has(error.code) ? `errors.${error.code}` : "chat.sendPreserved";
}

export const CHAT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const CHAT_ATTACHMENT_LIMIT = 10;

export function canAttachFile(file: File, sendOriginal = false) {
	return (
		file.size <= CHAT_ATTACHMENT_MAX_BYTES || (!sendOriginal && canPrepareLargeImage(file.name, file.type, file.size))
	);
}

export function draftFile(file: File, voiceTranscript?: string | null): DraftFile {
	return {
		id: crypto.randomUUID(),
		name: file.name,
		mimeType: file.type,
		blob: file,
		status: isImageFile(file.name, file.type) ? "preparing" : "ready",
		...(voiceTranscript !== undefined ? { voiceTranscript } : {}),
	};
}

/** Replace one file entry of a draft, leaving every other entry the same object. */
export function replaceFile(files: DraftFile[], id: string, patch: Partial<DraftFile>): DraftFile[] {
	return files.map((file) => (file.id === id ? { ...file, ...patch } : file));
}
