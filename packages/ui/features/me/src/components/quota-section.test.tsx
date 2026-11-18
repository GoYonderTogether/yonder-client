// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

const quota = vi.hoisted(() => ({ balance: 999_906 }));
const pool = (remaining: number) => ({
	granted: 1_000_000,
	used: 1_000_000 - remaining,
	remaining,
	remainingPercent: 100,
});
vi.mock("@yonder/ui-data", () => ({
	useQuota: () => ({
		data: {
			balance: quota.balance,
			granted: 1_000_000,
			used: 1_000_000 - quota.balance,
			pools: {
				main: pool(quota.balance),
				background: pool(0),
				coding: pool(0),
				external: pool(0),
				tools: pool(0),
			},
			overflow: {
				main: { overflow: false, rate: 1, floor: null },
				background: { overflow: true, rate: 1, floor: 4_000_000 },
				external: { overflow: false, rate: 1, floor: null },
				coding: { overflow: true, rate: 1.2, floor: 4_000_000 },
				tools: { overflow: false, rate: 1, floor: null },
			},
			configVersion: 1,
			cycle: { start: "2026-11-01T00:00:00.000Z", resetsAt: "2026-12-01T00:00:00.000Z" },
		},
	}),
	useQuotaLedger: () => ({ data: { pages: [] } }),
	useUsage: () => ({ data: { pages: [] } }),
	useQuotaRates: () => ({ data: undefined }),
}));

import { QuotaSection } from "./quota-section.tsx";

test.each([
	["zh-CN", "主额度"],
	["en", "Main"],
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
