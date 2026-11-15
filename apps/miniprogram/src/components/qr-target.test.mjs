import assert from "node:assert/strict";
import test from "node:test";
import { qrTarget } from "./qr-target.ts";

const base = "https://self.example";
test("accepts existing contact and invite QR formats on configured service", () => {
	for (const [input, target] of [
		["@hello123", "@hello123"],
		["hello123", "@hello123"],
		["13800138000", "13800138000"],
		["https://self.example/@hello123", "@hello123"],
		["/i/a_123", "/i/a_123"],
	])
		assert.equal(qrTarget(input, base), target);
});
test("rejects foreign origins, credentials, fragments and malformed handles", () => {
	for (const input of [
		"https://evil.example/@hello123",
		"https://self.example.evil/@hello123",
		"https://user@self.example/@hello123",
		"https://self.example/@hello123#x",
		"@ab__cd",
		"//evil.example/@hello123",
	])
		assert.equal(qrTarget(input, base), null, input);
});
