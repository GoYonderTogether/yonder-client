import type { DeviceProviderTarget } from "./device-provider.ts";

export interface Provider {
	id: string;
	scope: "platform" | "user";
	name: string;
	note?: string | null;
	website?: string | null;
	baseUrl: string;
	protocol: "openai" | "anthropic";
	models: string[];
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
	protocol: Provider["protocol"];
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
	contextLength?: number;
	capabilities?: Record<string, boolean>;
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
