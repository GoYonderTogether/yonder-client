/** Provider-neutral tool contracts shared by the kernel and model adapters. */
export interface AgentToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface AgentToolCall {
	id: string;
	name: string;
	arguments: string;
}

/**
 * An image a turn may show the model, named by reference only. The bytes live in object storage and
 * are resolved right before the provider call; transcripts and stored messages keep just this. A
 * run record must never carry image bytes: it is read by the admin app and kept for far longer than
 * the image itself.
 */
export interface AgentImageRef {
	/** What the reference points at; the host knows how to read each kind at request time. */
	source: "attachment" | "meeting_photo";
	/** The attachment (`att_…`), or the meeting (`mtg_…`) whose photo is named by `photoId`. */
	id: string;
	/** A recording photo's client id; present only for `meeting_photo`. */
	photoId?: string;
	/** A name a person would recognise, for the model's own description of what it is looking at. */
	name?: string;
}

export interface AgentMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	toolCalls?: AgentToolCall[];
	toolCallId?: string;
	isError?: boolean;
	/**
	 * Images this turn carries, as references. A request that shows images to the model is built from
	 * these right before the provider call and never written back: the transcript keeps the reference.
	 */
	images?: AgentImageRef[];
	/**
	 * The provider's own thinking for an assistant message, carried back unchanged when the provider
	 * requires it (DeepSeek: a tool-using request must return the earlier steps' reasoning, else 400).
	 * It is provider transport, not conversation: stored with the run transcript for a resume inside
	 * the same run, never read as context and never part of what the model is told.
	 */
	reasoning?: string;
}
