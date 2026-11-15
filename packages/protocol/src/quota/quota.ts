export interface InviteResponse {
	code: string;
	link: string;
	stats: { invitedCount: number; grantedTotal: number };
	rewardRule: { newUserGets: number; inviterGets: number; maxInvites: number | null };
}

export interface ResolveInviteResponse {
	valid: true;
	inviter: { handle: string; displayName: string; avatarUrl: string | null };
}

export interface QuotaResponse {
	balance: number;
	granted: number;
	used: number;
}

export interface LedgerEntry {
	id: string;
	at: string;
	kind: "grant_signup" | "grant_invite" | "grant_inviter" | "consume" | "adjust" | "refund";
	amount: number;
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
	provider: string;
	model: string;
	conversationId: string | null;
	taskId: string | null;
	fallbackIndex: number;
	inputTokens: number | null;
	outputTokens: number | null;
	cacheWriteTokens: number | null;
	cacheReadTokens: number | null;
	usageKnown: boolean;
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
