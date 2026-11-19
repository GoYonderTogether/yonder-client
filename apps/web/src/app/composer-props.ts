import type { ReactNode } from "react";
import type { CompletionBinding, CompletionMarker, TextEditRange } from "./completion/bindings.ts";
import type { CompletionItem } from "./completion/tokens.ts";
import type { DraftFile } from "./use-chat-draft.ts";

export interface ComposerProps {
	/** Who the message would go to; the placeholder names them. */
	recipientName: string | null;
	/** The draft lives in the frame, so it survives the composer leaving the screen (「我」, a resize). */
	draft: string;
	onDraftChange: (value: string, edit?: TextEditRange) => void;
	onSend: () => void;
	onSendVoice?: (file: File) => Promise<unknown>;
	onStop: () => void;
	streaming: boolean;
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
	files?: DraftFile[];
	onFiles?: (files: File[]) => void;
	onRemoveFile?: (id: string) => void;
	onRetryFile?: (id: string) => void;
	onOriginalFileChange?: (id: string, original: boolean) => void;
	mobilePicker?: boolean;
	onMeeting?: (() => void) | undefined;
	scope?: string;
	error?: string;
	readOnly?: boolean;
	microphoneOccupied?: boolean;
	onVoiceActivityChange?: (active: boolean) => void;
}
