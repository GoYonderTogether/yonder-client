import { beforeEach, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ values: new Map<string, unknown>() }));
vi.mock("@yonder/ui-data", () => ({
	updateChatCache: async (key: string, update: (value: unknown) => unknown) => {
		store.values.set(key, update(store.values.get(key)));
	},
}));

const { draftKey, mayFillDraft, registerPresetTarget, requestPreset, takePreset, withPreset } = await import(
	"./draft-preset.ts"
);

beforeEach(() => store.values.clear());

test("an empty or whitespace draft may be filled; anything typed by the user may not", () => {
	expect(mayFillDraft(undefined)).toBe(true);
	expect(mayFillDraft("")).toBe(true);
	expect(mayFillDraft("   \n ")).toBe(true);
	expect(mayFillDraft("帮我做")).toBe(false);
});

test("a preset keeps the draft's files and bumps the revision, as a keystroke does", () => {
	expect(withPreset(undefined, "帮我做一件事：")).toEqual({
		text: "帮我做一件事：",
		files: [],
		revision: 1,
		clientNonce: undefined,
	});
	const existing = { text: "", files: [{}], revision: 7, clientNonce: "n", bindings: [{}] };
	expect(withPreset(existing, "帮我创建一个定时任务。")).toMatchObject({
		files: [{}],
		revision: 8,
		bindings: [{}],
		clientNonce: undefined,
	});
});

test("an open composer takes the sentence at once and never sees it again", () => {
	const applied: string[] = [];
	const off = registerPresetTarget("draft:me:chat", (phrase) => {
		applied.push(phrase);
		return "applied";
	});
	requestPreset("me", "chat", "帮我做一件事：");
	expect(applied).toEqual(["帮我做一件事："]);
	expect(takePreset(draftKey("me", "chat"), undefined)).toBeUndefined();
	off();
});

test("a composer that is not open yet gets the sentence when it registers", () => {
	const applied: string[] = [];
	requestPreset("me", "chat", "帮我创建一个定时任务。");
	expect(store.values.get(draftKey("me", "chat"))).toMatchObject({ text: "帮我创建一个定时任务。" });
	const off = registerPresetTarget("draft:me:chat", (phrase) => {
		applied.push(phrase);
		return "applied";
	});
	expect(applied).toEqual(["帮我创建一个定时任务。"]);
	off();
});

test("a draft the user already typed in keeps its words and the preset is dropped", () => {
	const applied: string[] = [];
	const off = registerPresetTarget("draft:me:chat", () => "refused");
	requestPreset("me", "chat", "帮我做一件事：");
	expect(applied).toEqual([]);
	// The waiting phrase is handed to the composer, which refuses it because its draft is not empty.
	expect(takePreset(draftKey("me", "chat"), { text: "我自己写的", files: [], revision: 1 })).toBeUndefined();
	// Applied once: a second load has nothing waiting.
	expect(takePreset(draftKey("me", "chat"), { text: "", files: [], revision: 1 })).toBeUndefined();
	off();
});

test("the phrase waits for a composer that has not loaded its draft yet", () => {
	requestPreset("me", "chat", "帮我做一件事：");
	expect(takePreset(draftKey("me", "chat"), undefined)).toBe("帮我做一件事：");
});

test("a composer still loading its draft is handed the phrase when it is ready", () => {
	let ready = false;
	const applied: string[] = [];
	const off = registerPresetTarget("draft:me:chat", (phrase) => {
		if (!ready) return "not-ready";
		applied.push(phrase);
		return "applied";
	});
	requestPreset("me", "chat", "帮我做一件事：");
	expect(applied).toEqual([]);
	// The phrase is still waiting, so the composer takes it on the next attempt.
	expect(takePreset(draftKey("me", "chat"), undefined)).toBe("帮我做一件事：");
	ready = true;
	off();
});
