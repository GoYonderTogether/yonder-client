/**
 * Quota vocabulary. One quota is one millionth of a yuan, so a price written as "yuan per
 * million tokens" is numerically the same as "quota per token" for the four token categories.
 */

export type QuotaPool = "main" | "background" | "external" | "coding";

/** `legacy` rows predate the per-pool unit and are shown but never counted in a balance. */
export type QuotaLedgerPool = QuotaPool | "legacy";

export interface QuotaPoolBalance {
	/** This cycle's allowance: what is left plus what this cycle has already spent. */
	granted: number;
	/** Spent this cycle, net of refunds. */
	used: number;
	remaining: number;
	/** 0–100, from `remaining` against this cycle's allowance; 0 when nothing was granted. */
	remainingPercent: number;
}

export interface QuotaOverflowRule {
	/** Whether an exhausted pool may draw on the main pool. */
	overflow: boolean;
	/** Multiplier applied to the amount drawn from the main pool. */
	rate: number;
	/** The main pool may not be drawn below this fixed amount; null when there is no floor. */
	floor: number | null;
}

/** The current month cycle: grants land at 00:00 on the 1st, Beijing time. */
export interface QuotaCycle {
	/** When this cycle started, ISO. */
	start: string;
	/** When the next monthly grant lands, ISO. */
	resetsAt: string;
}

export interface QuotaResponse {
	/** The main pool, repeated at the top for screens that still show a single number. */
	balance: number;
	granted: number;
	used: number;
	pools: Record<QuotaPool, QuotaPoolBalance>;
	/** The rules currently in force; the catalog itself is `/v1/quota/config`. */
	overflow: Record<QuotaPool, QuotaOverflowRule>;
	/** The config revision these figures were charged under; a change means the catalog is stale. */
	configVersion: number;
	cycle: QuotaCycle;
}

/**
 * The published catalog behind `GET /v1/quota/config`: grant sizes, overflow rules and invite
 * rewards for the account's tier. It is the same for every account on a tier, so it is cached by
 * version rather than per account, and it carries no admin-only figures.
 */
export interface QuotaConfigResponse {
	version: number;
	tier: string;
	signup: Record<QuotaPool, number>;
	monthly: Record<QuotaPool, number>;
	rules: Record<QuotaPool, QuotaOverflowRule>;
	invite: { inviter: number; invitee: number; maxInvites: number };
}

export interface InviteResponse {
	code: string;
	link: string;
	stats: { invitedCount: number; grantedTotal: number };
	rewardRule: {
		newUserGets: number;
		inviterGets: number;
		maxInvites: number | null;
		/** The pool both rewards are granted into. */
		pool: QuotaPool;
	};
}

export interface ResolveInviteResponse {
	valid: true;
	inviter: { handle: string; displayName: string; avatarUrl: string | null };
}

export interface LedgerEntry {
	id: string;
	at: string;
	kind:
		| "grant_signup"
		| "grant_invite"
		| "grant_inviter"
		| "grant_monthly"
		| "grant_admin"
		| "expire"
		| "consume"
		| "adjust"
		| "refund";
	pool: QuotaLedgerPool;
	/** The multiplier applied when this row was drawn from the main pool for another pool. */
	rate: number;
	amount: number;
	/** The running balance of this row's own pool, not of every pool combined. */
	balanceAfter: number;
	note?: string;
	relatedMemberId?: string;
}

export interface QuotaLedgerPage {
	items: LedgerEntry[];
	nextCursor: string | null;
	hasMore: boolean;
}

export interface UsageEntry {
	id: string;
	at: string;
	/**
	 * The name shown to the account: a catalog display name for platform calls (`其他` when the
	 * model has none), or the account's own name for its own provider. Never a vendor or model id.
	 */
	model: string;
	conversationId: string | null;
	taskId: string | null;
	fallbackIndex: number;
	pool: QuotaPool;
	/** True when part of this call was drawn from the main pool after the pool ran out. */
	overflow: boolean;
	overflowRate: number | null;
	inputTokens: number | null;
	outputTokens: number | null;
	cacheWriteTokens: number | null;
	cacheReadTokens: number | null;
	usageKnown: boolean;
	/** Quota deducted for this call. */
	cost: number;
	costAmount: string | null;
	costCurrency: string | null;
	costEstimated: boolean;
	costSource: "reported" | "computed" | "unknown";
	ok: boolean;
	failReason: string | null;
}

export interface UsagePage {
	items: UsageEntry[];
	nextCursor: string | null;
	hasMore: boolean;
	summary: { calls: number; inputTokens: number; outputTokens: number; cost: number; unknownUsageCalls: number };
	daily: { date: string; calls: number; cost: number }[];
}

/**
 * One row of the published price list. `name` is the catalog's user-facing name — a tier label
 * such as 标准 or 轻量 — never a vendor or a model id.
 */
export interface RateCardEntry {
	name: string;
	input: number;
	output: number;
	cacheWrite: number;
	cacheRead: number;
	/** The input price relative to the baseline entry, which is 1. */
	multiple: number;
}

export interface RateCardResponse {
	/** How many quota one yuan is worth. */
	quotaPerYuan: number;
	/** The `name` of the entry every multiple is relative to. */
	baseline: string;
	items: RateCardEntry[];
}
