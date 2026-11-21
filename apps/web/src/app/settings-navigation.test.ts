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

test("the Channels picker is a query on one page, with an originating Bot parent only for its shortcut", () => {
	expect(channelsSettingsPath("bot/b")).toBe("/me/channels?bot=bot%2Fb");
	expect(settingsPagePaths(["channels"], "bot/a")).toEqual(["/me/bots", "/me/bots/bot%2Fa", "/me/channels"]);
	expect(settingsPagePaths(["channels"])).toEqual(["/me/channels"]);
});
