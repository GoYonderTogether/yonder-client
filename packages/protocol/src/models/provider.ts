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
	target?: DeviceProviderTarget;
	deviceStatus?: "online" | "offline";
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
}

export interface ProviderModelMetadata {
	contextLength?: number;
	capabilities?: Record<string, boolean>;
}

export interface DiscoverModelsRequest {
	baseUrl?: string;
	target?: DeviceProviderTarget;
	protocol: Provider["protocol"];
	providerId?: string;
	apiKey?: string;
}
