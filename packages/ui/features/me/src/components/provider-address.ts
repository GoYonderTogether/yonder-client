import type { ProviderProtocol } from "@yonder/protocol";

/**
 * The address a person pastes is rarely the address the adapter wants. Each wire appends its own
 * path and they disagree about the version segment: the OpenAI-style adapters add only
 * `/chat/completions` or `/responses`, so a `/v1` the provider's docs show belongs to the stored
 * address, while the Anthropic and Gemini adapters add their version themselves. This removes what
 * the adapter would add a second time (a pasted endpoint path, a duplicated version) and keeps what
 * it would not, so one rule serves both model discovery and saving.
 */
const SUFFIXES: Record<ProviderProtocol, readonly RegExp[]> = {
	"openai-chat": [/\/chat\/completions$/i, /\/models$/i],
	"openai-responses": [/\/responses$/i, /\/models$/i],
	"anthropic-messages": [/\/messages$/i, /\/models$/i, /\/v1$/i],
	"gemini-native": [/\/models(\/[^/]*)?$/i, /\/v1(beta\d*)?$/i],
};

export function normalizeAddress(value: string, protocol: ProviderProtocol): string {
	let address = value.trim().replace(/\/+$/, "");
	for (const suffix of SUFFIXES[protocol] ?? []) address = address.replace(suffix, "").replace(/\/+$/, "");
	return address;
}
