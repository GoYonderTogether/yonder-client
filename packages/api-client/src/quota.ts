import type {
	QuotaConfigResponse,
	QuotaLedgerPage,
	QuotaPool,
	QuotaResponse,
	RateCardResponse,
	UsageOverview,
	UsagePage,
	UsagePurpose,
	UsageRunPage,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

export interface UsageRunFilter {
	pool?: QuotaPool;
	purpose?: UsagePurpose;
	/** `YYYY-MM-DD`, an Asia/Shanghai day. */
	date?: string;
	conversation?: string;
}

function query(params: Record<string, string | undefined>): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
	const text = search.toString();
	return text ? `?${text}` : "";
}

/** Quota, the published catalog, the ledger and usage. */
export function quotaEndpoints(client: ApiClient) {
	return {
		quota(): Promise<QuotaResponse> {
			return client.request("/v1/quota");
		},

		/**
		 * The published catalog: grant sizes, overflow rules and invite rewards for a tier. Public,
		 * like the rate card, so the pricing page works signed out.
		 *
		 * `etag` is the cached version as the server quoted it (`"<version>"`). A 304 means the copy
		 * is still current and this resolves to `undefined`, so the caller keeps what it has.
		 */
		quotaConfig(etag?: string): Promise<QuotaConfigResponse | undefined> {
			return client.request("/v1/quota/config", {
				authenticated: false,
				...(etag ? { ifNoneMatch: etag } : {}),
				allowNotModified: true,
			});
		},

		quotaLedger(cursor?: string): Promise<QuotaLedgerPage> {
			const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
			return client.request(`/v1/quota/ledger${query}`);
		},

		/** Model calls, newest first; `run` narrows to one run's calls. */
		usage(cursor?: string, filter: { run?: string } = {}): Promise<UsagePage> {
			return client.request(`/v1/usage${query({ cursor, run: filter.run })}`);
		},

		/** One screen of the quota page: totals, a day-by-pool chart and where it went. */
		usageOverview(filter: { range?: "cycle" | "7d"; pool?: QuotaPool } = {}): Promise<UsageOverview> {
			return client.request(`/v1/usage/overview${query(filter)}`);
		},

		/** Spending grouped by run, the way the user remembers it: one reply, one task step. */
		usageRuns(cursor?: string, filter: UsageRunFilter = {}): Promise<UsageRunPage> {
			return client.request(`/v1/usage/runs${query({ cursor, ...filter })}`);
		},

		/** The published rate card; the quota page shows it under the billing explanation. */
		quotaRates(): Promise<RateCardResponse> {
			return client.request("/v1/quota/rates", { authenticated: false });
		},
	};
}
