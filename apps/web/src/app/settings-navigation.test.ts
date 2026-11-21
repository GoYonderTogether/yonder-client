import { expect, test } from "vitest";
import { channelsSettingsPath, settingsPagePaths } from "./settings-navigation.ts";

test("direct settings links keep their semantic parent and treat an encoded Bot ID as one segment", () => {
	expect(settingsPagePaths(["bots", "bot/a", "profile"])).toEqual([
		"/me/bots",
		"/me/bots/bot%2Fa",
		"/me/bots/bot%2Fa/profile",
	]);
	expect(settingsPagePaths(["reception", "drafts"])).toEqual(["/me/reception", "/me/reception/drafts"]);
	expect(settingsPagePaths(["reception", "folder", "folder/a", "document/b"])).toEqual([
		"/me/reception",
		"/me/reception/folder/folder%2Fa",
		"/me/reception/folder/folder%2Fa/document%2Fb",
	]);
	expect(settingsPagePaths(["reception", "document", "document/b"])).toEqual([
		"/me/reception",
		"/me/reception/document/document%2Fb",
	]);
});

test("a nested reception document keeps the nearest semantic parents mounted", () => {
	expect(settingsPagePaths(["reception", "folder", "visit", "folder", "access", "parking"])).toEqual([
		"/me/reception/folder/visit",
		"/me/reception/folder/visit/folder/access",
		"/me/reception/folder/visit/folder/access/parking",
	]);
	expect(settingsPagePaths(["reception", "folder", "visit", "folder", "access"])).toEqual([
		"/me/reception",
		"/me/reception/folder/visit",
		"/me/reception/folder/visit/folder/access",
	]);
	expect(settingsPagePaths(["reception", "all", "parking"])).toEqual([
		"/me/reception",
		"/me/reception/all",
		"/me/reception/all/parking",
	]);
	expect(settingsPagePaths(["reception", "find", "parking"])).toEqual(["/me/reception", "/me/reception/find/parking"]);
});

test("the Channels picker is a query on one page, with an originating Bot parent only for its shortcut", () => {
	expect(channelsSettingsPath("bot/b")).toBe("/me/channels?bot=bot%2Fb");
	expect(channelsSettingsPath("bot/b", "wechat")).toBe("/me/channels/wechat?bot=bot%2Fb");
	expect(channelsSettingsPath("bot/b", "external")).toBe("/me/channels/feishu/external?bot=bot%2Fb");
	expect(settingsPagePaths(["channels"], "bot/a")).toEqual(["/me/bots", "/me/bots/bot%2Fa", "/me/channels"]);
	expect(settingsPagePaths(["channels"])).toEqual(["/me/channels"]);
	expect(settingsPagePaths(["channels", "feishu", "external"], "bot/a")).toEqual([
		"/me/bots",
		"/me/bots/bot%2Fa",
		"/me/channels",
		"/me/channels/feishu",
		"/me/channels/feishu/external",
	]);
	expect(settingsPagePaths(["channels", "external"])).toEqual([
		"/me/channels",
		"/me/channels/feishu",
		"/me/channels/external",
	]);
});
