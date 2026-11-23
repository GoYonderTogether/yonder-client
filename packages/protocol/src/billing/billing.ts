export type BillingProvider = "wechat" | "alipay";

export interface BillingProduct {
	id: string;
	title: string;
	amountMinor: number;
	currency: "CNY";
	providers: BillingProvider[];
}

export interface BillingOrder {
	id: string;
	status: "pending" | "paid" | "expired" | "failed";
	expiresAt: string;
}

export interface CheckoutOrder extends BillingOrder {
	status: "pending";
	action: { type: "qr" | "redirect"; url: string };
}
