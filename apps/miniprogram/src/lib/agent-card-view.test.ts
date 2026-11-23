import type { AgentCard } from "@yonder/protocol";
import { expect, test } from "vitest";
import { choiceCardView, newerCard } from "./agent-card-view";

const options = [
	{ id: "group-confirm", label: "执行" },
	{ id: "group-cancel", label: "不执行" },
];
const card = (extra: Partial<AgentCard> = {}): AgentCard => ({
	id: "crd_1",
	kind: "confirm",
	state: "open",
	title: "爬山群",
	summary: "把老王移出群",
	body: { type: "choices", options },
	version: 1,
	...extra,
});

test("an open card says what it is about and lets each label be tapped", () => {
	const view = choiceCardView(card(), true);
	expect(view).toMatchObject({ question: "爬山群", summary: "把老王移出群", result: undefined, selected: null });
	expect(view?.options).toEqual(["执行", "不执行"]);
	expect(view?.actionFor("执行")).toBe("group-confirm");
	expect(view?.actionFor("没有这一项")).toBeUndefined();
});

test("a card answered shows the choice and what became of it, and nothing can be tapped", () => {
	const view = choiceCardView(
		card({
			state: "done",
			result: "没有执行：你现在不是这个群的群主",
			body: { type: "choices", options, selected: "group-confirm" },
		}),
		true,
	);
	expect(view?.summary).toBeUndefined();
	expect(view?.result).toBe("没有执行：你现在不是这个群的群主");
	expect(view?.selected).toBe("执行");
	expect(view?.actionFor("执行")).toBeUndefined();
});

test("nothing can be tapped while disconnected or while an answer is in flight", () => {
	expect(choiceCardView(card(), false)?.actionFor("执行")).toBeUndefined();
});

test("a kind with no choices is not drawn", () => {
	expect(choiceCardView(card({ body: { type: "list", items: [{ id: "a", title: "A" }] } }), true)).toBeNull();
	expect(choiceCardView(card({ body: undefined }), true)).toBeNull();
});

test("a late older update never undoes a newer card", () => {
	const newer = card({ version: 3, state: "done" });
	expect(newerCard(newer, card({ version: 2 }))).toBe(newer);
	expect(newerCard(card({ version: 1 }), newer)).toBe(newer);
	expect(newerCard(null, newer)).toBe(newer);
});
