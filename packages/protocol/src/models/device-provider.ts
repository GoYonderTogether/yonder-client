/** Explicitly approved protocol for a model profile stored on the owner's device. */
export type DeviceModelProtocol = "openai" | "anthropic";

export interface DeviceProviderTarget {
	kind: "device";
	deviceId: string;
	endpointId: string;
}

export interface DeviceModelEndpoint {
	endpointId: string;
	revision: number;
	label: string;
	protocol: DeviceModelProtocol;
}

export interface DeviceModelEndpointView extends DeviceModelEndpoint {
	deviceId: string;
}

export type DeviceModelError =
	| "endpoint_unavailable"
	| "model_not_found"
	| "invalid_response"
	| "timeout"
	| "cancelled"
	| "upstream_rejected";

export interface DeviceModelInput {
	model: string;
	messages: unknown[];
	max_tokens: number;
	stream: true;
	stream_options: { include_usage: true };
	tools?: unknown[];
	tool_choice?: "none";
}

export interface DeviceAnthropicModelInput {
	model: string;
	system: string;
	messages: {
		role: "user" | "assistant";
		content: (
			| { type: "text"; text: string }
			| { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
			| { type: "tool_result"; tool_use_id: string; content: string; is_error: boolean }
		)[];
	}[];
	max_tokens: number;
	stream: true;
	tools?: { name: string; description: string; input_schema: Record<string, unknown> }[];
	tool_choice?: { type: "none" };
}

export type DeviceLocalRelayInput =
	| { operation: "discover"; protocol: DeviceModelProtocol }
	| { operation: "chat"; protocol: "openai"; body: DeviceModelInput }
	| { operation: "chat"; protocol: "anthropic"; body: DeviceAnthropicModelInput };

export type DeviceLocalRelayRequest = DeviceLocalRelayInput & {
	mode: "device-local";
	endpointId: string;
	revision: number;
	expiresAt: string;
};
