export interface DeviceProviderTarget {
	kind: "device";
	deviceId: string;
	endpointId: string;
}

export interface DeviceModelEndpoint {
	endpointId: string;
	revision: number;
	label: string;
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
