import assert from "node:assert/strict";
import test from "node:test";
import { navigationLayout, pageDestination } from "./navigation.ts";

test("navigation reserves capsule and status-bar space on a phone", () => {
	assert.deepEqual(navigationLayout(390, 47, { top: 51, height: 32, left: 291 }), {
		barHeight: 40,
		headerHeight: 87,
		rightInset: 107,
	});
});
test("missing simulator capsule retains a usable title area", () => {
	assert.deepEqual(navigationLayout(390, 0, { top: 0, height: 0, left: 0 }), {
		barHeight: 44,
		headerHeight: 44,
		rightInset: 96,
	});
});

test("sign-in destinations strip H5 router stamps and preserve actual deep-link params", () => {
	assert.equal(
		pageDestination("/pages/chat/index?stamp=EF", { id: "conv_123", stamp: "EF" }),
		"/pages/chat/index?id=conv_123",
	);
	assert.equal(
		pageDestination("pages/sign-in/index?stamp=AB", { invite: "invite_code", stamp: "AB" }),
		"/pages/sign-in/index?invite=invite_code",
	);
});
