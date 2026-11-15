/**
 * Quota vocabulary. One quota is one millionth of a yuan, so a price written as "yuan per
 * million tokens" is numerically the same as "quota per token" for the four token categories.
 */

export type QuotaPool = "main" | "background" | "external" | "coding";

/** `legacy` rows predate the per-pool unit and are shown but never counted in a balance. */
export type QuotaLedgerPool = QuotaPool | "legacy";

export interface QuotaPoolBalance {
	granted: number;
	used: number;
	remaining: number;
	/** 0–100; 0 when nothing was granted. */
	remainingPercent: number;
}

export interface QuotaOverflowRule {
	/** Whether an exhausted pool may draw on the main pool. */
	overflow: boolean;
	/** Multiplier applied to the amount drawn from the main pool. */
	rate: number;
	/** The main pool may not fall below this share of its granted amount; null when there is no floor. */
	floorPercent: number | null;
}

export interface QuotaResponse {
	/** The main pool, repeated at the top for screens that still show a single number. */
	balance: number;
	granted: number;
	used: number;
	pools: Record<QuotaPool, QuotaPoolBalance>;
	overflow: Record<QuotaPool, QuotaOverflowRule>;
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
	kind: "grant_signup" | "grant_invite" | "grant_inviter" | "consume" | "adjust" | "refund";
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
	provider?: string;
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

/** Quota per token for each token category; a price in yuan per million tokens equals this value. */
export interface RateCardEntry {
	model: string;
	displayName: string;
	input: number;
	output: number;
	cacheWrite: number;
	cacheRead: number;
	/** The input price relative to the baseline model, which is 1. */
	multiple: number;
}

export interface RateCardResponse {
	/** How many quota one yuan is worth. */
	quotaPerYuan: number;
	baseline: string;
	items: RateCardEntry[];
}
