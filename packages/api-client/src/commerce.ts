import type {
	BillingOrder,
	BillingProduct,
	BillingProvider,
	CheckoutOrder,
	DeviceInfo,
	WechatWebAttempt,
	WechatWebStatus,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

export function commerceEndpoints(client: ApiClient) {
	return {
		wechatWebConfig: (signal: AbortSignal) =>
			client.request<{ enabled: boolean }>("/v1/auth/wechat/web/config", { authenticated: false, signal }),
		startWechatWeb: (linking: boolean, signal: AbortSignal) =>
			linking
				? client.request<WechatWebAttempt>("/v1/auth/wechat/web/link/start", { method: "POST", signal })
				: client.request<WechatWebAttempt>("/v1/auth/wechat/web/start", {
						body: { agreeTerms: true },
						authenticated: false,
						signal,
					}),
		wechatWebStatus: (ticket: string, linking: boolean, device: DeviceInfo | undefined, signal: AbortSignal) =>
			client.request<WechatWebStatus>("/v1/auth/wechat/web/status", {
				body: device ? { ticket, device } : { ticket },
				authenticated: linking,
				signal,
			}),
		billingCatalog: (signal: AbortSignal) =>
			client.request<{ products: BillingProduct[] }>("/v1/billing/catalog", { authenticated: false, signal }),
		createBillingOrder: (productId: string, provider: BillingProvider, signal: AbortSignal) =>
			client.request<CheckoutOrder>("/v1/billing/orders", { body: { productId, provider }, signal }),
		billingOrder: (id: string, signal: AbortSignal) =>
			client.request<BillingOrder>(`/v1/billing/orders/${encodeURIComponent(id)}`, { signal }),
	};
}
