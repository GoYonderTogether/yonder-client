import type { ProviderModelMetadata, ProviderProtocol } from "@yonder/protocol";
import { defaultsFor, type EffortLevel } from "./provider-model-defaults.ts";
import { formatTokens, parseTokens } from "./provider-token-units.ts";

/** The levels a model slot may declare; the same list the server stores as `capabilities.efforts`. */
export const EFFORT_LEVELS = ["off", "low", "medium", "high", "max"] as const;
export type { EffortLevel };

/**
 * One row of the model table. `id` is the model name the endpoint expects, `name` is what the app
 * shows a person, and `efforts` is what this model's upstream really accepts — an empty list means
 * the node never sends it a thinking field.
 */
export interface ModelSlot {
	key: string;
	name: string;
	id: string;
	/** What the person typed: `1M`, `200K` or a plain count. Parsed on save. */
	contextLength: string;
	/** The most one answer may generate, typed the same way. */
	maxOutput: string;
	efforts: EffortLevel[];
}

export function newSlot(partial: Partial<ModelSlot> = {}): ModelSlot {
	return {
		key: crypto.randomUUID(),
		name: "",
		id: "",
		contextLength: "",
		maxOutput: "",
		efforts: [],
		...partial,
	};
}

/**
 * A discovered model as a row that is already filled in: its display name starts as the id, and the
 * window and levels come from its family (see provider-model-defaults.ts), with whatever the
 * endpoint declared taking precedence.
 */
export function discoveredSlot(id: string, declared: ProviderModelMetadata | undefined): ModelSlot {
	const defaults = defaultsFor(id, declared);
	return newSlot({
		id,
		name: defaults.name ?? id,
		contextLength: defaults.contextLength ? formatTokens(defaults.contextLength) : "",
		maxOutput: declared?.maxOutput ? formatTokens(declared.maxOutput) : "",
		efforts: defaults.efforts ?? [],
	});
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
			contextLength: metadata?.[id]?.contextLength ? formatTokens(metadata[id]?.contextLength as number) : "",
			maxOutput: metadata?.[id]?.maxOutput ? formatTokens(metadata[id]?.maxOutput as number) : "",
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
		const contextLength = parseTokens(slot.contextLength) ?? 0;
		const maxOutput = parseTokens(slot.maxOutput) ?? 0;
		metadata[id] = {
			...(slot.name.trim() ? { name: slot.name.trim() } : {}),
			...(contextLength > 0 ? { contextLength } : {}),
			...(maxOutput > 0 ? { maxOutput } : {}),
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
