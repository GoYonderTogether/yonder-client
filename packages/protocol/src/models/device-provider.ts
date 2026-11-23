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
	/** The wire the endpoint speaks; a device that names none speaks OpenAI. */
	protocol: DeviceModelProtocol;
}

/**
 * One endpoint as the device-model endpoint list returns it. The device-model wire is OpenAI-only,
 * so this view carries no protocol; the local relay's `DeviceModelEndpoint` names one.
 */
export interface DeviceModelEndpointView {
	deviceId: string;
	endpointId: string;
	revision: number;
	label: string;
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

/**
 * The device-local relay (the shipped client): one HTTP call made on the device, answered with a
 * head, then ordered body parts, then an end.
 */
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

/**
 * The device-model request/result wire: the server asks the device to discover or infer, and the
 * device POSTs numbered result batches back. A device that advertises this wire answers here.
 */
interface DeviceModelRequestBase {
	type: "device_model.request";
	requestId: string;
	endpointId: string;
	revision: number;
	expiresAt: string;
}

export type DeviceModelRequest =
	| (DeviceModelRequestBase & { operation: "discover" })
	| (DeviceModelRequestBase & { operation: "chat"; body: DeviceModelInput });

export interface DeviceModelStreamBatch {
	seq: number;
	data: string;
	done: boolean;
	error?: DeviceModelError;
}
