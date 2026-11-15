/**
 * Every cache key, defined once (08-前端缓存和同步 第三节). A page never builds a key string: it
 * asks for one, which is what makes "invalidate this and its children" predictable.
 */
export const keys = {
	me: () => ["me"] as const,
	sessions: () => ["sessions"] as const,
	health: () => ["health"] as const,
	quota: () => ["quota"] as const,
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
	providers: () => ["providers"] as const,
} as const;

/** Root prefixes used when signing out: every key that must be dropped starts with one of these. */
export const ALL_ROOT_KEYS: readonly string[] = [
	"me",
	"sessions",
	"health",
	"quota",
	"invite",
	"conversations",
	"messages",
	"providers",
	"usage",
];
