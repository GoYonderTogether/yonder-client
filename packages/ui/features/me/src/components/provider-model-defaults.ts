import type { ProviderModelMetadata } from "@yonder/protocol";

/**
 * What a newly discovered model starts with, before the person touches it.
 *
 * A form full of empty fields is a form the person fills twice: once to fetch the model list, once
 * to say what each model is. CC Switch answers this with the same idea — a model mapping table whose
 * rows carry a display name, a context window and a thinking level, defaulted from the model's
 * family — so these defaults follow it: the display name starts as the id, and the window and the
 * levels come from the family the id names. Whatever the endpoint itself declared always wins, and
 * a person's own value wins over both.
 *
 * The table is a *starting point*, never a claim: a provider's own limit differs from the family's
 * published one, so the window is editable and a model whose window nobody states is compressed by
 * the provider's own limit rather than by a number invented here.
 */

export type EffortLevel = "off" | "low" | "medium" | "high" | "max";

export interface ModelFamily {
	/** Matched against the lowercased model id. */
	match: RegExp;
	/** The window the family's documentation states, in tokens. */
	window: number;
	/** The levels the family's upstream accepts; `off` only where a stop-thinking switch exists. */
	efforts: EffortLevel[];
	/** What the app shows when the id alone is not readable enough. */
	label?: string;
}

/**
 * The families worth knowing by name. Ordered most specific first: a longer match (a dated snapshot,
 * a tier) must win over the family it belongs to.
 */
export const MODEL_FAMILIES: readonly ModelFamily[] = [
	// Anthropic
	{
		match: /claude-(opus|sonnet|haiku)-5|claude-fable-5/,
		window: 1_000_000,
		efforts: ["low", "medium", "high", "max"],
		label: "Claude 5",
	},
	{
		match: /claude-(opus|sonnet|haiku)-4/,
		window: 200_000,
		efforts: ["low", "medium", "high", "max"],
		label: "Claude 4",
	},
	// OpenAI
	{ match: /gpt-6|gpt-5\.6/, window: 1_050_000, efforts: ["low", "medium", "high"], label: "GPT" },
	{ match: /gpt-5(?!\.6)|o[34](-|$)/, window: 400_000, efforts: ["low", "medium", "high"], label: "GPT" },
	// DeepSeek
	{ match: /deepseek/, window: 1_000_000, efforts: ["off", "low", "medium", "high"], label: "DeepSeek" },
	// Zhipu
	{ match: /glm-5|glm-4\.6|glm-4\.5/, window: 200_000, efforts: ["off", "low", "medium", "high"], label: "GLM" },
	// Moonshot
	{ match: /kimi-k3|kimi-k2|kimi-k1\.5/, window: 256_000, efforts: ["off", "low", "medium", "high"], label: "Kimi" },
	// Alibaba
	{ match: /qwen3|qwen-max|qwen-plus/, window: 256_000, efforts: ["off", "low", "medium", "high"], label: "Qwen" },
	// Google
	{
		match: /gemini-3|gemini-2\.5/,
		window: 1_000_000,
		efforts: ["off", "low", "medium", "high", "max"],
		label: "Gemini",
	},
	// MiniMax
	{ match: /minimax-m|abab/, window: 204_800, efforts: ["off", "low", "medium", "high"], label: "MiniMax" },
	// xAI
	{ match: /grok-[34]/, window: 256_000, efforts: ["off", "low", "medium", "high"], label: "Grok" },
	// Meta
	{ match: /llama-?[34]/, window: 128_000, efforts: [], label: "Llama" },
	// Mistral
	{ match: /mistral-large|magistral/, window: 128_000, efforts: [], label: "Mistral" },
	// StepFun
	{ match: /step-[35]/, window: 128_000, efforts: ["off", "low", "medium", "high"], label: "Step" },
	// Tencent
	{ match: /hunyuan/, window: 128_000, efforts: ["off", "low", "medium", "high"], label: "Hunyuan" },
];

export function familyOf(id: string): ModelFamily | undefined {
	const lower = id.toLowerCase();
	return MODEL_FAMILIES.find((family) => family.match.test(lower));
}

/**
 * The defaults for one discovered model. The endpoint's own declaration wins for the window and
 * the levels; the family only fills what the endpoint did not say.
 */
export interface ModelDefaults {
	name?: string;
	contextLength?: number;
	efforts?: EffortLevel[];
}

export function defaultsFor(id: string, declared: ProviderModelMetadata | undefined): ModelDefaults {
	const family = familyOf(id);
	const declaredEfforts = Array.isArray(declared?.efforts)
		? declared.efforts.filter((level): level is EffortLevel => EFFORT_LEVELS.includes(level as EffortLevel))
		: [];
	return {
		...(declared?.name ? { name: declared.name } : {}),
		...(declared?.contextLength
			? { contextLength: declared.contextLength }
			: family
				? { contextLength: family.window }
				: {}),
		...(declaredEfforts.length
			? { efforts: declaredEfforts }
			: family?.efforts.length
				? { efforts: [...family.efforts] }
				: {}),
	};
}

const EFFORT_LEVELS: readonly EffortLevel[] = ["off", "low", "medium", "high", "max"];
