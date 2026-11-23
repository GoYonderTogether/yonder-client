import type { Provider, ProviderList } from "@yonder/protocol";
import { expect, test } from "vitest";
import { defaultChoiceId, modelChoices } from "./model-choices.ts";

const own = (overrides: Partial<Provider>): Provider => ({
	id: "prv_own",
	scope: "user",
	name: "Mine",
	baseUrl: "https://example.org",
	protocol: "openai",
	models: ["m"],
	keyConfigured: true,
	enabled: true,
	isDefault: false,
	origin: "cloud",
	...overrides,
});

test("platform models come first, then own providers, with device ones marked", () => {
	const list: ProviderList = {
		platformModels: [
			{ id: "m1", name: "DeepSeek", enabled: true, isDefault: true },
			{ id: "m2", name: "Off", enabled: false, isDefault: false },
		],
		items: [
			own({}),
			own({ id: "prv_dev", name: "Local", origin: "device", deviceId: "dev_1", deviceName: "Studio Mac" }),
		],
	};
	expect(modelChoices(list).map((c) => [c.id, c.source, c.usable])).toEqual([
		["m1", "platform", true],
		["prv_own", "own", true],
		["prv_dev", "device", true],
	]);
	expect(modelChoices(list)[2]?.deviceName).toBe("Studio Mac");
	expect(defaultChoiceId(list)).toBe("m1");
});

test("an own provider without a key is listed but cannot be picked", () => {
	const list: ProviderList = { platformModels: [], items: [own({ keyConfigured: false })] };
	expect(modelChoices(list)[0]?.usable).toBe(false);
});

test("the person's own default wins over the platform's", () => {
	const list: ProviderList = {
		platformModels: [{ id: "m1", name: "DeepSeek", enabled: true, isDefault: false }],
		items: [own({ isDefault: true })],
	};
	expect(defaultChoiceId(list)).toBe("prv_own");
	expect(defaultChoiceId(undefined)).toBeNull();
});
