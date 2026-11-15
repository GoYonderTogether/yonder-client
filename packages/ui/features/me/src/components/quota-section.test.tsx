// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

const quota = vi.hoisted(() => ({ balance: 999_906 }));
vi.mock("@yonder/ui-data", () => ({
	useQuota: () => ({ data: { balance: quota.balance, granted: 1_000_000, used: 1_000_000 - quota.balance } }),
	useQuotaLedger: () => ({ data: { pages: [] } }),
	useUsage: () => ({ data: { pages: [] } }),
}));

import { QuotaSection } from "./quota-section.tsx";

test.each([
	["zh-CN", "剩余额度 · token"],
	["en", "Balance · tokens"],
] as const)("the main balance shows each deduction in %s", (locale, label) => {
	quota.balance = 999_906;
	const i18n = createI18n(locale);
	const content = () => (
		<I18nextProvider i18n={i18n}>
			<QuotaSection />
		</I18nextProvider>
	);
	const { rerender } = render(content());
	const balance = screen.getByText(label).nextElementSibling;
	expect(balance).toHaveTextContent("999,906");
	quota.balance = 999_905;
	rerender(content());
	expect(balance).toHaveTextContent("999,905");
});
