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

export interface AgentMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	toolCalls?: AgentToolCall[];
	toolCallId?: string;
	isError?: boolean;
	/**
	 * The provider's own thinking for an assistant message, carried back unchanged when the provider
	 * requires it (DeepSeek: a tool-using request must return the earlier steps' reasoning, else 400).
	 * It is provider transport, not conversation: stored with the run transcript for a resume inside
	 * the same run, never read as context and never part of what the model is told.
	 */
	reasoning?: string;
}
