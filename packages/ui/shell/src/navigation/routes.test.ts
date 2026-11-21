import { describe, expect, test } from "vitest";
import { isTab, locate, MOBILE_TABS, ROUTES, TAB_SPECS, TABS, tabPath } from "./routes.ts";

describe("the tab registry", () => {
	test("desktop adds Contacts after the shared tabs", () => {
		expect(MOBILE_TABS).toEqual(["messages", "tasks", "memory"]);
		expect(TABS.map(tabPath)).toEqual(["/messages", "/tasks", "/memory", "/contacts"]);
		for (const tab of MOBILE_TABS) {
			expect(TAB_SPECS[tab].composer).toBe(true);
			expect(TAB_SPECS[tab].hasList).toBe(true);
		}
		expect(TAB_SPECS.contacts).toMatchObject({ hasList: true, composer: false });
		expect(isTab("me")).toBe(false);
		expect(isTab("today")).toBe(false);
	});
});

describe("the route table", () => {
	test("uses unique paths and the three layers", () => {
		expect(new Set(ROUTES.map((route) => route.path)).size).toBe(ROUTES.length);
		for (const route of ROUTES) expect(["tab", "detail", "overlay"]).toContain(route.layer);
	});

	test("segments stay in the tab layer and me is a detail", () => {
		for (const path of ["/tasks/scheduled"]) {
			expect(ROUTES.find((route) => route.path === path)?.layer).toBe("tab");
		}
		for (const path of ["/me", "/me/:section", "/me/:section/:page"]) {
			expect(ROUTES.find((route) => route.path === path)?.layer).toBe("detail");
		}
	});
});

describe("locate", () => {
	test("locates tab roots, segments and details", () => {
		expect(locate("/messages")).toEqual({ tab: "messages", detail: [] });
		expect(locate("/messages/my%20bot")).toEqual({ tab: "messages", detail: ["my bot"] });
		expect(locate("/tasks/scheduled")).toEqual({ tab: "tasks", detail: ["scheduled"] });
		expect(locate("/memory/timeline")).toEqual({ tab: "memory", detail: ["timeline"] });
		expect(locate("/memory/g/sources%3A会议")).toEqual({ tab: "memory", detail: ["g", "sources:会议"] });
		expect(locate("/contacts")).toEqual({ tab: "contacts", detail: [] });
		expect(locate("/contacts/add")).toBeNull();
	});

	test("locates me separately from the tabs", () => {
		expect(locate("/me")).toEqual({ tab: null, detail: [] });
		expect(locate("/me/account/password")).toEqual({ tab: null, detail: ["account", "password"] });
	});

	test("does not locate retired or public routes", () => {
		expect(locate("/today")).toBeNull();
		expect(locate("/sign-in")).toBeNull();
		expect(locate("/")).toBeNull();
	});
});
