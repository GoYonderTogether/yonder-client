import { expect, test } from "vitest";
import { releasePath } from "./channel-path.ts";

test("channel navigation stays on this site and preserves the active route", () => {
	const location = { pathname: "/beta//messages/main", search: "?q=notes&beta-setup=1", hash: "#last" };
	expect(releasePath("stable", location)).toBe("/messages/main?q=notes#last");
	expect(releasePath("beta", location)).toBe("/beta/messages/main?q=notes#last");
});
