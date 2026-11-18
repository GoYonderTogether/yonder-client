import { expect, test } from "vitest";
import { signInDestination } from "./destination";

test("restores registered internal pages without permitting external or malformed destinations", () => {
	expect(signInDestination(encodeURIComponent("/pages/chat/index?id=conv_1"))).toBe("/pages/chat/index?id=conv_1");
	expect(signInDestination(encodeURIComponent("/pages/memory/index"))).toBe("/pages/memory/index");
	for (const value of [
		"https://evil.invalid",
		"//evil.invalid",
		"/pages/sign-in/index",
		"/pages/unknown/index",
		"%E0%A4%A",
		"/pages/chat/index\\evil",
	])
		expect(signInDestination(value)).toBe("/pages/conversations/index");
});
