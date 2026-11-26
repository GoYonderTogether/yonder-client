/** The three layers and the shared tab registry (11-布局和页面层级, third edition). */
export type Layer = "tab" | "detail" | "overlay";

export const MOBILE_TABS = ["messages", "tasks", "memory"] as const;
export const TABS = [...MOBILE_TABS, "contacts"] as const;
export type TabId = (typeof TABS)[number];

export interface TabSpec {
	id: TabId;
	path: string;
	hasList: boolean;
	composer: boolean;
}

export const TAB_SPECS: Record<TabId, TabSpec> = {
	messages: { id: "messages", path: "/messages", hasList: true, composer: true },
	tasks: { id: "tasks", path: "/tasks", hasList: true, composer: true },
	memory: { id: "memory", path: "/memory", hasList: true, composer: true },
	contacts: { id: "contacts", path: "/contacts", hasList: true, composer: false },
};

/** The pinned conversation with the person's Bot. */
export const MAIN_CONVERSATION = "main";
export const BOT_VISITS = "bot-visits";
export const BOT_VISITS_PATH = `/messages/${BOT_VISITS}`;

export interface RouteEntry {
	path: string;
	layer: Layer;
	tab?: TabId;
	public?: boolean;
}

export const ROUTES: readonly RouteEntry[] = [
	{ path: "/sign-in", layer: "tab", public: true },
	{ path: "/terms", layer: "tab", public: true },
	{ path: "/privacy", layer: "tab", public: true },
	{ path: "/pricing", layer: "tab", public: true },
	{ path: "/setup/:step", layer: "tab" },
	{ path: "/messages", layer: "tab", tab: "messages" },
	{ path: BOT_VISITS_PATH, layer: "detail", tab: "messages" },
	{ path: `${BOT_VISITS_PATH}/:conversationId`, layer: "detail", tab: "messages" },
	{ path: "/messages/:conversationId", layer: "detail", tab: "messages" },
	{ path: "/tasks", layer: "tab", tab: "tasks" },
	{ path: "/tasks/scheduled", layer: "tab", tab: "tasks" },
	{ path: "/tasks/:taskId", layer: "detail", tab: "tasks" },
	{ path: "/memory", layer: "tab", tab: "memory" },
	/** Private AI profile, the whole timeline, a file group, or one encoded file path. */
	{ path: "/memory/about", layer: "detail", tab: "memory" },
	{ path: "/memory/timeline", layer: "detail", tab: "memory" },
	{ path: "/memory/g/:group", layer: "detail", tab: "memory" },
	{ path: "/memory/files/:path", layer: "detail", tab: "memory" },
	{ path: "/contacts", layer: "tab", tab: "contacts" },
	{ path: "/me", layer: "detail" },
	{ path: "/me/:section", layer: "detail" },
	{ path: "/me/:section/:page", layer: "detail" },
	{ path: "/me/bots/:botId/:page", layer: "detail" },
];

export function tabPath(tab: TabId): string {
	return TAB_SPECS[tab].path;
}

export function isTab(value: string): value is TabId {
	return (TABS as readonly string[]).includes(value);
}

/** 「我」 is a detail outside the tabs; segment paths stay associated with their tab. */
export function locate(pathname: string): { tab: TabId | null; detail: string[] } | null {
	const [first, ...rest] = pathname.split("/").filter(Boolean);
	if (!first || (first !== "me" && !isTab(first))) return null;
	if (first === "contacts" && rest.length) return null;
	return { tab: first === "me" ? null : first, detail: rest.map(decodeURIComponent) };
}
