import { expect, test } from "vitest";
import { normalizeAddress } from "./provider-address.ts";

test("an OpenAI-style address keeps its /v1 and loses a pasted endpoint path", () => {
	expect(normalizeAddress("https://api.site/v1/", "openai-chat")).toBe("https://api.site/v1");
	expect(normalizeAddress("https://api.site/v1/chat/completions", "openai-chat")).toBe("https://api.site/v1");
	expect(normalizeAddress("https://api.deepseek.com", "openai-chat")).toBe("https://api.deepseek.com");
	expect(normalizeAddress("https://api.openai.com/v1/responses", "openai-responses")).toBe("https://api.openai.com/v1");
});

test("an Anthropic address loses the version the adapter adds itself", () => {
	expect(normalizeAddress("https://api.site/v1", "anthropic-messages")).toBe("https://api.site");
	expect(normalizeAddress("https://api.site/v1/messages", "anthropic-messages")).toBe("https://api.site");
	expect(normalizeAddress("https://api.anthropic.com/", "anthropic-messages")).toBe("https://api.anthropic.com");
});

test("a Gemini address loses its version and models path", () => {
	expect(normalizeAddress("https://generativelanguage.googleapis.com/v1beta/models", "gemini-native")).toBe(
		"https://generativelanguage.googleapis.com",
	);
	expect(normalizeAddress("https://generativelanguage.googleapis.com/v1beta", "gemini-native")).toBe(
		"https://generativelanguage.googleapis.com",
	);
});
