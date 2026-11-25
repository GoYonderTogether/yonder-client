import type { ProviderModelMetadata, ProviderProtocol } from "@yonder/protocol";

/** The levels a model slot may declare; the same list the server stores as `capabilities.efforts`. */
export const EFFORT_LEVELS = ["off", "low", "medium", "high", "max"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

/**
 * One row of the model table. `id` is the model name the endpoint expects, `name` is what the app
 * shows a person, and `efforts` is what this model's upstream really accepts — an empty list means
 * the node never sends it a thinking field.
 */
export interface ModelSlot {
	key: string;
	name: string;
	id: string;
	contextLength: string;
	efforts: EffortLevel[];
}

export function newSlot(partial: Partial<ModelSlot> = {}): ModelSlot {
	return {
		key: crypto.randomUUID(),
		name: "",
		id: "",
		contextLength: "",
		efforts: [],
		...partial,
	};
}

/** Slots from a saved provider: the stored metadata carries the display name and the levels. */
export function slotsFromProvider(
	models: readonly string[],
	metadata: Record<string, ProviderModelMetadata> | undefined,
	names: Record<string, string> | undefined,
): ModelSlot[] {
	return models.map((id) =>
		newSlot({
			id,
			name: names?.[id] ?? metadata?.[id]?.name ?? "",
			contextLength: metadata?.[id]?.contextLength ? String(metadata[id]?.contextLength) : "",
			efforts: readEfforts(metadata?.[id]?.efforts),
		}),
	);
}

function readEfforts(value: unknown): EffortLevel[] {
	if (!Array.isArray(value)) return [];
	const set = new Set(value);
	return EFFORT_LEVELS.filter((level) => set.has(level));
}

/** A slot is only real once it names a model; a half-filled new row is dropped rather than saved. */
export function completeSlots(slots: readonly ModelSlot[]): ModelSlot[] {
	const seen = new Set<string>();
	return slots.filter((slot) => {
		const id = slot.id.trim();
		if (!id || seen.has(id)) return false;
		seen.add(id);
		return true;
	});
}

/**
 * What a save sends. `contextLength` is declared, never inferred: a model whose window nobody
 * stated is watched at the provider's default rather than at a number invented here.
 */
export function saveMetadata(slots: readonly ModelSlot[]): Record<string, ProviderModelMetadata> {
	const metadata: Record<string, ProviderModelMetadata> = {};
	for (const slot of slots) {
		const id = slot.id.trim();
		if (!id) continue;
		const contextLength = Number(slot.contextLength);
		metadata[id] = {
			...(slot.name.trim() ? { name: slot.name.trim() } : {}),
			...(Number.isSafeInteger(contextLength) && contextLength > 0 ? { contextLength } : {}),
			...(slot.efforts.length ? { efforts: [...slot.efforts] } : {}),
		};
	}
	return metadata;
}

/** The protocol options the form offers, in the order they are shown. */
export const PROTOCOL_OPTIONS: readonly ProviderProtocol[] = [
	"openai-chat",
	"openai-responses",
	"anthropic-messages",
	"gemini-native",
];

/**
 * The request address each protocol expects, as an example. They differ in where the version and
 * the model live, which is the one thing a person cannot guess from the protocol's name.
 */
export const PROTOCOL_EXAMPLES: Record<ProviderProtocol, { placeholder: string; path: string }> = {
	"openai-chat": { placeholder: "https://api.example.com", path: "/v1/chat/completions" },
	"openai-responses": { placeholder: "https://api.openai.com", path: "/v1/responses" },
	"anthropic-messages": { placeholder: "https://api.anthropic.com", path: "/v1/messages" },
	"gemini-native": { placeholder: "https://generativelanguage.googleapis.com", path: "/v1beta/models" },
};

/** Whether the address already ends in the version segment the adapter will add itself. */
export function addressHasVersion(baseUrl: string): boolean {
	try {
		return /\/v\d+(beta\d*)?\/?$/i.test(new URL(baseUrl.trim()).pathname);
	} catch {
		return false;
	}
}
