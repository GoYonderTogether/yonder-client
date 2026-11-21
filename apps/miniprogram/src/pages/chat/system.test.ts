import type { GroupSystemEvent, SystemEvent } from "@yonder/protocol";
import { describe, expect, it } from "vitest";
import { closureSentence, joinNames, systemSentence } from "./system";

const event = (value: Partial<GroupSystemEvent> & Pick<GroupSystemEvent, "event">): GroupSystemEvent => ({
	actorName: null,
	targetNames: [],
	...value,
});

describe("group lifecycle sentences", () => {
	it("says the user's own words for a dissolved group", () => {
		expect(systemSentence(event({ event: "dissolved" }), "zh-CN")).toBe("该群聊已被解散");
		expect(systemSentence(event({ event: "dissolved" }), "en")).toBe("The group was dissolved");
	});
	it("names who was removed and who did it", () => {
		const removed = event({ event: "removed", actorName: "Ann", targetNames: ["Bob", "Cleo"] });
		expect(systemSentence(removed, "zh-CN")).toBe("Ann 将 Bob、Cleo 移出群聊");
		expect(systemSentence(removed, "en")).toBe("Ann removed Bob, Cleo");
	});
	it("renders joins, renames and the new owner", () => {
		expect(systemSentence(event({ event: "joined", targetNames: ["Bob"] }), "zh-CN")).toBe("Bob 加入了群聊");
		expect(systemSentence(event({ event: "joined", targetNames: ["Bob"] }), "en")).toBe("Bob joined");
		expect(systemSentence(event({ event: "renamed", actorName: "Ann", title: "Trip" }), "en")).toBe(
			"Ann renamed the group to Trip",
		);
		expect(systemSentence(event({ event: "owner_changed", targetNames: ["Bob"] }), "zh-CN")).toBe("Bob 成为新群主");
		expect(systemSentence(event({ event: "owner_changed", targetNames: ["Bob"] }), "en")).toBe(
			"Bob is now the group owner",
		);
	});
	it("renders group creation with or without initial members in both languages", () => {
		const created = event({ event: "created", actorName: "Ann", targetNames: ["Bob", "Cleo Bot"] });
		expect(systemSentence(created, "zh-CN")).toBe("Ann 创建了群聊，Bob、Cleo Bot 加入了群聊");
		expect(systemSentence(created, "en")).toBe("Ann created the group. Bob, Cleo Bot joined");
		const alone = event({ event: "created", actorName: "Ann" });
		expect(systemSentence(alone, "zh-CN")).toBe("Ann 创建了群聊");
		expect(systemSentence(alone, "en")).toBe("Ann created the group");
	});
	it("falls back to a neutral actor when the server named nobody", () => {
		expect(systemSentence(event({ event: "removed", targetNames: ["Bob"] }), "zh-CN")).toBe("有人 将 Bob 移出群聊");
		expect(systemSentence(event({ event: "removed", targetNames: ["Bob"] }), "en")).toBe("Someone removed Bob");
	});
	it("joins names the way each language writes a list", () => {
		expect(joinNames(["A", "B"], "zh-CN")).toBe("A、B");
		expect(joinNames(["A", "B"], "en")).toBe("A, B");
	});
});

it("renders a memory update as a system message in both languages", () => {
	const one: SystemEvent = {
		event: "memory_updated",
		changes: [{ path: "/me/近期.md", title: "近期", version: 2, previousVersion: 1 }],
	};
	expect(systemSentence(one, "zh-CN")).toBe("记忆已更新 · 近期");
	expect(systemSentence(one, "en")).toBe("Memory updated · 近期");
	const two: SystemEvent = {
		event: "memory_updated",
		changes: [
			{ path: "/me/近期.md", title: "近期", version: 2, previousVersion: 1 },
			{ path: "/notes/小林.md", title: "小林", version: 1, previousVersion: 0 },
		],
	};
	expect(systemSentence(two, "zh-CN")).toBe("记忆已更新 · 2 处");
	expect(systemSentence(two, "en")).toBe("Memory updated · 2 files");
});

describe("closed group copy", () => {
	it("distinguishes dissolved from removed", () => {
		expect(closureSentence("dissolved", "zh-CN")).toBe("该群聊已被解散");
		expect(closureSentence("removed", "zh-CN")).toBe("你已被移出群聊");
		expect(closureSentence("removed", "en")).toBe("You were removed from the group");
	});
	it("says something true before the reason is known", () => {
		expect(closureSentence(null, "zh-CN")).toBe("这个群聊已不能发消息");
		expect(closureSentence(undefined, "en")).toBe("This group no longer accepts messages");
	});
});
