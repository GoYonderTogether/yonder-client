import { describe, expect, test } from "vitest";
import { isSetupStep, nextStep, previousStep, setupPath, stepsFor } from "./setup-steps.ts";

describe("first-run steps", () => {
	test("run you, bot, connect where something can be connected", () => {
		expect(stepsFor(true)).toEqual(["you", "bot", "connect"]);
		expect(nextStep("you", true)).toBe("bot");
		expect(nextStep("bot", true)).toBe("connect");
		expect(nextStep("connect", true)).toBeNull();
	});

	test("drop the connect step where nothing can be connected", () => {
		expect(stepsFor(false)).toEqual(["you", "bot"]);
		expect(nextStep("bot", false)).toBeNull();
	});

	test("step back to the one before, and stop at the first", () => {
		expect(previousStep("connect", true)).toBe("bot");
		expect(previousStep("you", true)).toBeNull();
	});

	test("recognise only their own names in the address", () => {
		expect(isSetupStep("bot")).toBe(true);
		expect(isSetupStep("password")).toBe(false);
		expect(isSetupStep(undefined)).toBe(false);
		expect(setupPath("you")).toBe("/setup/you");
	});
});
