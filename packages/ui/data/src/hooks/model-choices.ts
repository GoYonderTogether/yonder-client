import type { ProviderList } from "@yonder/protocol";

/**
 * One thing a person can pick to answer with: a model of the platform, or a provider of their own.
 * `id` is what the server stores for the account default and for a Bot's own choice: the platform
 * model's id, or the provider's id. The server resolves it; the client never needs the platform's
 * supplier behind a model.
 */
export interface ModelChoice {
	id: string;
	name: string;
	source: "platform" | "own" | "device";
	/** The relay device's name for a provider that runs through one. */
	deviceName?: string;
	/** A provider that cannot answer right now (no key, disabled). It is listed but cannot be picked. */
	usable: boolean;
}

/** Platform models first (they always exist), then the person's own providers, in list order. */
export function modelChoices(list: ProviderList | undefined): ModelChoice[] {
	if (!list) return [];
	const platform = list.platformModels
		.filter((model) => model.enabled)
		.map<ModelChoice>((model) => ({ id: model.id, name: model.name, source: "platform", usable: true }));
	const own = list.items
		.filter((provider) => provider.scope === "user")
		.map<ModelChoice>((provider) => ({
			id: provider.id,
			name: provider.name,
			source: provider.origin === "device" ? "device" : "own",
			...(provider.deviceName ? { deviceName: provider.deviceName } : {}),
			usable: provider.enabled && provider.keyConfigured && provider.models.length > 0,
		}));
	return [...platform, ...own];
}

/** The choice the account answers with by default, if the list says which. */
export function defaultChoiceId(list: ProviderList | undefined): string | null {
	if (!list) return null;
	const own = list.items.find((provider) => provider.scope === "user" && provider.isDefault);
	if (own) return own.id;
	return list.platformModels.find((model) => model.isDefault && model.enabled)?.id ?? null;
}
