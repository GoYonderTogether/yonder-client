// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { CheckoutEntry } from "./checkout.tsx";

const actions = vi.hoisted(() => ({ create: vi.fn(), read: vi.fn(), refreshQuota: vi.fn() }));
vi.mock("@yonder/ui-data", () => ({
	useBillingCatalog: () => [
		{ id: "fixture", title: "Credit pack", amountMinor: 1234, currency: "CNY", providers: ["wechat"] },
	],
	useBillingActions: () => actions,
}));
vi.mock("./commerce-dialog.tsx", () => ({
	CommerceDialog: ({ children }: { children: ReactNode }) => children,
}));

test("checkout follows the server after expiry and refreshes credits only once paid", async () => {
	vi.useFakeTimers();
	try {
		const status = { id: "fixture-order", status: "pending", expiresAt: new Date(Date.now() + 1000).toISOString() };
		actions.create.mockResolvedValue({ ...status, action: { type: "qr", url: "weixin://wxpay/bizpayurl?pr=fixture" } });
		actions.read.mockResolvedValue(status);
		render(
			<I18nextProvider i18n={createI18n("en")}>
				<CheckoutEntry />
			</I18nextProvider>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Buy credits" }));
		expect(actions.create).not.toHaveBeenCalled();
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "WeChat Pay" }));
		});
		expect(actions.create).toHaveBeenCalledWith("fixture", "wechat", expect.any(AbortSignal));
		expect(screen.getByRole("img", { name: "Scan with WeChat to pay" })).toBeVisible();

		await act(() => vi.advanceTimersByTimeAsync(2000));
		expect(screen.getByText("Checking for a final payment result…")).toBeVisible();
		expect(screen.queryByRole("img")).not.toBeInTheDocument();
		expect(actions.refreshQuota).not.toHaveBeenCalled();

		actions.read.mockResolvedValue({ ...status, status: "paid" });
		await act(() => vi.advanceTimersByTimeAsync(5000));
		expect(screen.getByText("Payment confirmed.")).toBeVisible();
		expect(actions.refreshQuota).toHaveBeenCalledOnce();
	} finally {
		vi.useRealTimers();
	}
});
