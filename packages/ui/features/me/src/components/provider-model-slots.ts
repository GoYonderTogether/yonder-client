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

/**
 * The wire a known device endpoint serves, as the four-protocol form names it. The gateway recorded
 * the endpoint's wire when it was approved, and discovery or a save must speak that wire rather than
 * whatever the form's own select happens to show (2026-11-26).
 */
export function endpointWire(
	endpoints: readonly { endpointId: string; protocol?: string }[] | undefined,
	endpointId: string,
): ProviderProtocol | undefined {
	if (!endpointId) return undefined;
	return presetWire(endpoints?.find((candidate) => candidate.endpointId === endpointId)?.protocol);
}

/** A pre-four-protocol name (`openai`, `anthropic`) as the wire the form trades in. */
export function presetWire(value: string | undefined): ProviderProtocol | undefined {
	if (!value) return undefined;
	if (value === "openai") return "openai-chat";
	if (value === "anthropic") return "anthropic-messages";
	return value as ProviderProtocol;
}

/** A provider address without its trailing slashes, for comparing two spellings of one place. */
export function normaliseAddress(value: string): string {
	return value.trim().replace(/\/+$/, "");
}

/** Display names from the metadata map, so a slot can show one without the rest of the row. */
export function displayNamesFrom(
	metadata: Record<string, ProviderModelMetadata> | undefined,
): Record<string, string> | undefined {
	if (!metadata) return undefined;
	const names = Object.fromEntries(
		Object.entries(metadata)
			.filter(([, item]) => item.name)
			.map(([id, item]) => [id, item.name as string]),
	);
	return Object.keys(names).length ? names : undefined;
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

/**
 * What a newly discovered model starts with, before the person touches it.
 *
 * A form full of empty fields is a form the person has to fill twice: once to get the model list,
 * once to say what each model is. These are the defaults CC Switch uses for the same job — the
 * display name starts as the model id, and the window and the levels come from the id itself, since
 * the family is usually readable from it. Anything the endpoint declared wins over the guess, and a
 * person's own value always wins over both.
 *
 * The window is only ever a starting number for the *display*; the model row stores what the form
 * says, and a model whose window nobody states is compressed by the provider's own limit.
 */
export function defaultsFor(id: string, declared: ProviderModelMetadata | undefined): Partial<ModelSlot> {
	const lower = id.toLowerCase();
	return {
		name: declared?.name ?? id,
		contextLength: declared?.contextLength ? String(declared.contextLength) : String(knownWindow(lower) ?? ""),
		efforts: readEfforts(declared?.efforts).length ? readEfforts(declared?.efforts) : knownEfforts(lower),
	};
}

/**
 * The window the model family is published with. Kept deliberately short: only families whose
 * documentation states one number, and only so the field starts somewhere sensible.
 */
function knownWindow(id: string): number | null {
	if (/claude-(opus|sonnet|haiku)-5|claude-fable-5/.test(id)) return 1_000_000;
	if (/gpt-6|gpt-5\.6/.test(id)) return 1_050_000;
	if (/deepseek/.test(id)) return 1_000_000;
	if (/glm-5|glm-4\.6/.test(id)) return 200_000;
	if (/kimi-k3|kimi-k2/.test(id)) return 256_000;
	if (/gemini-3|gemini-2\.5/.test(id)) return 1_000_000;
	if (/qwen3/.test(id)) return 256_000;
	return null;
}

/**
 * The levels the family takes. `off` is included only for families that accept a "stop thinking"
 * switch; a family that has no such switch would answer a 400 for it.
 */
function knownEfforts(id: string): EffortLevel[] {
	if (/claude-(opus|sonnet|haiku)-5|claude-fable-5/.test(id)) return ["low", "medium", "high", "max"];
	if (/gpt-6|gpt-5\.6/.test(id)) return ["low", "medium", "high"];
	if (/deepseek|glm|kimi|qwen/.test(id)) return ["off", "low", "medium", "high"];
	if (/gemini-3|gemini-2\.5/.test(id)) return ["off", "low", "medium", "high", "max"];
	return [];
}

/** A slot the person has just discovered, filled with the family's defaults. */
export function discoveredSlot(id: string, declared: ProviderModelMetadata | undefined): ModelSlot {
	return newSlot({ id, ...defaultsFor(id, declared) });
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
			// A display name identical to the id is not worth storing: the list already shows the id.
			...(slot.name.trim() && slot.name.trim() !== id ? { name: slot.name.trim() } : {}),
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
