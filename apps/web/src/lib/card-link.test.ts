import { expect, test } from "vitest";
import { cardInviteCode, cardLink } from "./card-link.ts";
import { qrTarget } from "./qr-target.ts";

test("a card link is the handle path on the origin, with the invite code as a query", () => {
	expect(cardLink("abcde1", "https://yonder.zethai.cn")).toBe("https://yonder.zethai.cn/@abcde1");
	expect(cardLink("abcde1", "https://yonder.zethai.cn", "INV_1")).toBe("https://yonder.zethai.cn/@abcde1?i=INV_1");
});

test("Yonder's own scanner opens the card a shared link points at", () => {
	const link = cardLink("abcde1", "https://yonder.zethai.cn", "INV_1");
	expect(qrTarget(link, "https://yonder.zethai.cn")).toBe("@abcde1");
});

test("only a plausible invite code is taken from the query", () => {
	expect(cardInviteCode("?i=INV_1")).toBe("INV_1");
	expect(cardInviteCode("?i=")).toBeNull();
	expect(cardInviteCode("?i=a%20b")).toBeNull();
	expect(cardInviteCode("")).toBeNull();
});
