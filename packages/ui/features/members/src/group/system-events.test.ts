import type { SystemEvent } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { describe, expect, test } from "vitest";
import { closedGroupNotice, systemEventText, type Translate } from "./system-events.ts";

/** The real instance's translate function, so the test reads the shipped tables, not a stub. */
const translate = (locale: "en" | "zh-CN") => createI18n(locale).getFixedT(locale, "translation") as Translate;

const events: SystemEvent[] = [
	{ event: "created", actorName: "Ana", targetNames: ["Bo", "Cy Bot"] },
	{ event: "created", actorName: "Ana", targetNames: [] },
	{ event: "removed", actorName: "Ana", targetNames: ["Bo", "Cy"] },
	{ event: "dissolved", actorName: null, targetNames: [] },
	{ event: "joined", actorName: "Bo", targetNames: ["Dee"] },
	{ event: "renamed", actorName: "Ana", targetNames: [], title: "Weekend plans" },
	{ event: "owner_changed", actorName: "Ana", targetNames: ["Bo"] },
];

describe("systemEventText", () => {
	test("every event has an English sentence", () => {
		const t = translate("en");
		expect(events.map((event) => systemEventText(event, t))).toEqual([
			"Ana created the group. Bo, Cy Bot joined",
			"Ana created the group",
			"Ana removed Bo, Cy",
			"The group was dissolved",
			"Dee joined",
			"Ana renamed the group to Weekend plans",
			"Bo is now the group owner",
		]);
	});

	test("every event has a Chinese sentence, and the one the user named is exact", () => {
		const t = translate("zh-CN");
		expect(events.map((event) => systemEventText(event, t))).toEqual([
			"Ana 创建了群聊，Bo、Cy Bot 加入了群聊",
			"Ana 创建了群聊",
			"Ana 移除了 Bo、Cy",
			"该群聊已被解散",
			"Dee 加入了群聊",
			"Ana 把群名改为 Weekend plans",
			"Bo 成为群主",
		]);
	});

	test("an event with no actor still names who it acted on, in both languages", () => {
		const noActor: SystemEvent[] = [
			{ event: "removed", actorName: null, targetNames: ["Bo"] },
			{ event: "owner_changed", actorName: null, targetNames: [] },
		];
		expect(systemEventText(noActor[0] as SystemEvent, translate("en"))).toBe("Someone removed Bo");
		expect(systemEventText(noActor[0] as SystemEvent, translate("zh-CN"))).toBe("有人 移除了 Bo");
		expect(systemEventText(noActor[1] as SystemEvent, translate("en"))).toBe("Someone is now the group owner");
	});
});

describe("closedGroupNotice", () => {
	test("a dissolved group says 该群聊已被解散, and a removed member knows why", () => {
		expect(closedGroupNotice("dissolved", translate("zh-CN"))).toBe("该群聊已被解散");
		expect(closedGroupNotice("removed", translate("zh-CN"))).toBe("你已被移出群聊");
		expect(closedGroupNotice("dissolved", translate("en"))).toBe("This group chat has been dissolved");
		expect(closedGroupNotice("removed", translate("en"))).toBe("You were removed from this group");
	});

	test("an open group has no notice", () => {
		expect(closedGroupNotice(null, translate("en"))).toBeNull();
		expect(closedGroupNotice(undefined, translate("zh-CN"))).toBeNull();
	});
});
