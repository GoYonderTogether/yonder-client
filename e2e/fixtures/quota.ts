import type { QuotaResponse } from "@yonder/protocol";

const pool = { granted: 10, used: 0, remaining: 10, remainingPercent: 100 };
const rule = { overflow: false, rate: 1, floor: null };

export const quota: QuotaResponse = {
	balance: pool.remaining,
	granted: pool.granted,
	used: pool.used,
	pools: { main: pool, background: pool, coding: pool, external: pool },
	overflow: { main: rule, background: rule, coding: rule, external: rule },
	configVersion: 1,
	cycle: { start: "2026-11-01T00:00:00Z", resetsAt: "2026-12-01T00:00:00Z" },
};
