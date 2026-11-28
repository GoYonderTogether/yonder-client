import type { DeviceProviderTarget } from "./device-provider.ts";

/**
 * The four upstream wire formats. They are not interchangeable: each has its own request body and
 * stream shape, and each has an adapter file of the same name under `agent/models/src/adapters`.
 * `openai` and `anthropic` are the names older clients send; the server maps them on save.
 */
export type ProviderProtocol = "openai-chat" | "openai-responses" | "anthropic-messages" | "gemini-native";

export interface Provider {
	id: string;
	scope: "platform" | "user";
	name: string;
	note?: string | null;
	website?: string | null;
	baseUrl: string;
	/**
	 * The upstream wire this provider speaks. The server always answers with one of the four names;
	 * the two older names are accepted here so a client built before the four-protocol release still
	 * type-checks against the same shared package.
	 */
	protocol: ProviderProtocol | "openai" | "anthropic";
	models: string[];
	/** The model this provider answers with; null when it has none. */
	defaultModel?: string | null;
	/** Per-model display names, windows and declared effort levels, keyed by model id. */
	metadata?: Record<string, ProviderModelMetadata>;
	keyConfigured: boolean;
	enabled: boolean;
	isDefault: boolean;
	/** cloud = the server calls out directly; device = the call is relayed through a device session. */
	origin: "cloud" | "device";
	/** Set only when origin is device. */
	deviceId?: string | null;
	deviceName?: string | null;
	/** Local-key mode: a device-owned profile, never a server URL or key. */
	endpointId?: string;
	deviceStatus?: "online" | "offline";
	/** Read compatibility with the device model-release clients: the selected device endpoint. */
	target?: DeviceProviderTarget;
}

/** Public platform catalog: upstream connection details never leave the server. */
export interface PlatformModel {
	id: string;
	name: string;
	enabled: boolean;
	isDefault: boolean;
}

export interface ProviderList {
	items: Provider[];
	platformModels: PlatformModel[];
}

/** Keys only travel from the user's form to the server; they are absent from Provider. */
export interface SaveProviderRequest {
	name: string;
	note?: string | null;
	website?: string | null;
	baseUrl?: string;
	target?: DeviceProviderTarget;
	/** The four wire names, plus the two pre-release names a device-model client may still send. */
	protocol: Provider["protocol"] | "openai" | "anthropic";
	models: string[];
	apiKey?: string;
	metadata?: Record<string, ProviderModelMetadata>;
	/** Default is cloud. Device requires deviceId and lets baseUrl be a local address. */
	origin?: "cloud" | "device";
	/** The device that relays the calls; required when origin is device. */
	deviceId?: string;
	endpointId?: string;
}

/** Device-gateway candidates: the devices a provider may bind to. */
export interface RelayDevice {
	id: string;
	name: string;
	platform: string;
	online: boolean;
}

export interface ProviderModelMetadata {
	/** What the app shows a person; the endpoint is always sent the model id instead. */
	name?: string;
	contextLength?: number;
	/** The most one answer may generate, in tokens, as the provider or the person declared it. */
	maxOutput?: number;
	capabilities?: Record<string, boolean>;
	/**
	 * The reasoning levels this model's upstream really accepts, weakest first
	 * (`off`, `low`, `medium`, `high`, `max`). Empty or absent means the model is never sent a
	 * thinking field: some upstreams answer a 400 for one they do not know.
	 */
	efforts?: string[];
}

export interface DiscoverModelsRequest {
	baseUrl?: string;
	origin?: "device";
	deviceId?: string;
	endpointId?: string;
	target?: DeviceProviderTarget;
	protocol: Provider["protocol"];
	providerId?: string;
	apiKey?: string;
}
