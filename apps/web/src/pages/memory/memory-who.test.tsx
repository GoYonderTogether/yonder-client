// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@yonder/ui-data", () => ({
	useBot: () => ({ displayName: "小助手" }),
	useContacts: () => ({ data: { items: [{ id: "bot-2", displayName: "记账员" }] } }),
}));

const { useAuthorName } = await import("./memory-who.ts");

test("authors are named, never by internal words (23 §18)", () => {
	const { result } = renderHook(() => useAuthorName());
	const author = result.current;
	expect(author({ updatedBy: "user", updatedByName: null })).toBe("memory.byYou");
	expect(author({ updatedBy: "system", updatedByName: null })).toBe("memory.bySystem");
	expect(author({ updatedBy: "bot:bot-9", updatedByName: "写手" })).toBe("写手");
	// A revision has no name from the server: the contact list names the Bot.
	expect(author({ updatedBy: "bot:bot-2", updatedByName: null })).toBe("记账员");
	expect(author({ updatedBy: "bot:gone", updatedByName: null })).toBe("memory.byBot");
	expect(author({ updatedBy: "checkpoint:run-1", updatedByName: null })).toBe("小助手");
	expect(author({ updatedBy: "digest:run-2", updatedByName: "小助手" })).toBe("小助手");
	expect(author({ updatedBy: "router", updatedByName: "会议" })).toBe("会议");
	expect(author({ updatedBy: "router", updatedByName: null, path: "/sources/recordings/2026-11/25-周会.md" })).toBe(
		"recordings",
	);
});
