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
}
