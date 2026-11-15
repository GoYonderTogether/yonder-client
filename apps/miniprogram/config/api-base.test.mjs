import assert from "node:assert/strict";
import test from "node:test";
import { resolveApiBase } from "./api-base.ts";

test("API build configuration accepts HTTPS and local HTTP, without leaking URL credentials", () => {
	assert.equal(resolveApiBase("https://api.example.test/prefix/"), "https://api.example.test/prefix");
	assert.equal(resolveApiBase("http://127.0.0.1:8097/"), "http://127.0.0.1:8097");
	assert.equal(resolveApiBase("http://[::1]:8097"), "http://[::1]:8097");
	for (const address of [
		"http://api.example.test",
		"ftp://localhost",
		"https://user:secret@example.test",
		"https://example.test?token=secret",
		"https://example.test#fragment",
	]) {
		assert.throws(() => resolveApiBase(address));
	}
});
