import type {
	QuotaConfigResponse,
	QuotaLedgerPage,
	QuotaResponse,
	RateCardResponse,
	UsagePage,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

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

		usage(cursor?: string): Promise<UsagePage> {
			const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
			return client.request(`/v1/usage${query}`);
		},

		/** The published rate card; the quota page shows it under the billing explanation. */
		quotaRates(): Promise<RateCardResponse> {
			return client.request("/v1/quota/rates", { authenticated: false });
		},
	};
}
