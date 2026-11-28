import type { Attachment } from "@yonder/protocol";
import type { OutgoingFile } from "@yonder/ui-data";
import { canPrepareLargeImage, isImageFile, type PreparedImage, prepareImage } from "../lib/prepare-image.ts";
import { AttachmentTooLargeError } from "./draft-send-error.ts";

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

export function selectedDraftFile(file: DraftFile) {
	if (file.optimized && !file.sendOriginal) return { ...file.optimized, original: false };
	return { blob: file.blob, name: file.name, mimeType: file.mimeType, nonce: file.id, original: true };
}

export function outgoingFile(file: DraftFile): OutgoingFile {
	const { blob, name, mimeType, nonce } = selectedDraftFile(file);
	const image = isImageFile(name, mimeType);
	const kind = image ? "image" : mimeType.startsWith("audio/") ? "audio" : "file";
	return {
		blob,
		name,
		mimeType,
		nonce,
		kind,
		optimize: image && !file.sendOriginal && !file.imagePrepared && !file.optimized,
	};
}

export async function prepareOutgoingFile(file: OutgoingFile): Promise<OutgoingFile> {
	const variant = file.optimize
		? await prepareImage(file.blob, file.name, CHAT_ATTACHMENT_MAX_BYTES).catch(() => undefined)
		: undefined;
	const selected = variant
		? { ...file, blob: variant.blob, name: variant.name, mimeType: variant.mimeType, nonce: variant.nonce }
		: file;
	if (selected.blob.size > CHAT_ATTACHMENT_MAX_BYTES) throw new AttachmentTooLargeError();
	return file.optimize ? { ...selected, optimize: false } : selected;
}
