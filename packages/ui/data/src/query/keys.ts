/**
 * Every cache key, defined once (08-前端缓存和同步 第三节). A page never builds a key string: it
 * asks for one, which is what makes "invalidate this and its children" predictable.
 */
export const keys = {
	me: () => ["me"] as const,
	sessions: () => ["sessions"] as const,
	devices: () => ["devices"] as const,
	deviceRegistration: (installationId: string) => ["device-registration", installationId] as const,
	health: () => ["health"] as const,
	meetings: {
		all: () => ["meetings"] as const,
		list: (conversationId: string) => ["meetings", "list", conversationId] as const,
		detail: (id: string) => ["meetings", "detail", id] as const,
	},
	memory: {
		all: () => ["memory"] as const,
		days: () => ["memory", "days"] as const,
	},
	quota: () => ["quota"] as const,
	quotaConfig: () => ["quota", "config"] as const,
	quotaRates: () => ["quota", "rates"] as const,
	usage: (range: string) => ["usage", range] as const,
	ledger: () => ["quota", "ledger"] as const,
	invite: () => ["invite"] as const,
	resolveInvite: (code: string) => ["invite", "resolve", code] as const,
	conversations: {
		all: () => ["conversations"] as const,
		list: () => ["conversations", "list"] as const,
		detail: (id: string) => ["conversations", "detail", id] as const,
	},
	messages: {
		root: () => ["messages"] as const,
		all: (id: string) => ["messages", id] as const,
		latest: (id: string) => ["messages", id, "latest"] as const,
		page: (id: string, cursor: string) => ["messages", id, "page", cursor] as const,
	},
	contacts: () => ["contacts"] as const,
	contactSearch: (query: string) => ["contact-search", query] as const,
	providers: () => ["providers"] as const,
	connectors: {
		all: () => ["connectors"] as const,
		catalog: () => ["connectors", "catalog"] as const,
		list: () => ["connectors", "list"] as const,
	},
	skills: {
		all: () => ["skills"] as const,
		list: () => ["skills", "list"] as const,
		detail: (id: string) => ["skills", "detail", id] as const,
		files: (id: string) => ["skills", "file", id] as const,
		file: (id: string, revision: string, path: string) => ["skills", "file", id, revision, path] as const,
	},
	schedules: {
		all: () => ["schedules"] as const,
		list: () => ["schedules", "list"] as const,
	},
	memberProfile: (handle: string) => ["member-profile", handle] as const,
	publicMemberProfile: (handle: string) => ["member-profile", "public", handle] as const,
	privacy: () => ["privacy"] as const,
	items: {
		all: () => ["items"] as const,
		/** One account's list; `botId` narrows it to one Bot. */
		list: (botId: string | null) => ["items", "list", botId ?? "all"] as const,
		detail: (id: string) => ["items", "detail", id] as const,
	},
} as const;

/** Root prefixes used when signing out: every key that must be dropped starts with one of these. */
export const ALL_ROOT_KEYS: readonly string[] = [
	"me",
	"sessions",
	"devices",
	"device-registration",
	"health",
	"quota",
	"invite",
	"conversations",
	"messages",
	"providers",
	"contacts",
	"contact-search",
	"usage",
	"skills",
	"connectors",
	"meetings",
	"memory",
	"schedules",
	"member-profile",
	"privacy",
	"items",
];
