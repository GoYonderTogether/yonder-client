import type { Endpoints } from "@yonder/api-client";
import type { ReactNode, RefObject } from "react";
import type { ChatVoice } from "../lib/chat-voice.ts";
import type { CompletionBinding, CompletionMarker, TextEditRange } from "./completion/bindings.ts";
import type { CompletionItem } from "./completion/tokens.ts";
import type { DraftFile } from "./use-chat-draft.ts";
import type { useDirectAttachmentSend } from "./use-direct-attachment-send.ts";

export interface ComposerProps {
	/** Who the message would go to; the placeholder names them. */
	recipientName: string | null;
	/** The draft lives in the frame, so it survives the composer leaving the screen (「我」, a resize). */
	draft: string;
	onDraftChange: (value: string, edit?: TextEditRange) => void;
	onSend: () => void;
	onSendVoice?: (recording: ChatVoice, signal: AbortSignal) => Promise<unknown>;
	speech?: {
		transcription?: Pick<Endpoints, "openVoiceSocket" | "transcribeAudio"> | undefined;
		knownNonce?: ((nonce: string) => boolean) | undefined;
	};
	/** A send (upload included) is in flight; the button becomes a working cancel. */
	sending?: boolean;
	onCancelSend?: () => void;
	disabled: boolean;
	disconnected: boolean;
	sendOnEnter: boolean;
	completionItems?: readonly CompletionItem[];
	selectedSkillIds?: readonly string[];
	bindings?: readonly CompletionBinding[];
	onAcceptCompletion?: (text: string, marker: CompletionMarker, edit: TextEditRange) => void;
	onCompact?: () => void;
	commandStatus?: ReactNode;
	visitRelay?: { conversationId: string; messageId: string | undefined; pending: boolean } | undefined;
	files?: DraftFile[];
	onFiles?: (files: File[]) => void;
	pickedFiles?: Pick<ReturnType<typeof useDirectAttachmentSend>, "send" | "retry" | "discard" | "failed"> | undefined;
	onRemoveFile?: (id: string) => void;
	onRetryFile?: (id: string) => void;
	onOriginalFileChange?: (id: string, original: boolean) => void;
	mobilePicker?: boolean;
	onAttachmentPanelChange?: ((open: boolean) => void) | undefined;
	onMeeting?: (() => void) | undefined;
	scope?: string;
	error?: string;
	readOnly?: boolean;
	editorRef?: RefObject<HTMLTextAreaElement | null>;
	microphoneOccupied?: boolean;
	onVoiceActivityChange?: (active: boolean) => void;
}
