// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { QuotaPool, UsageOverview } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

const pool = (granted: number, remaining: number) => ({
	granted,
	used: granted - remaining,
	remaining,
	remainingPercent: (remaining / granted) * 100,
});
const quota = {
	balance: 41_200_000,
	granted: 65_000_000,
	used: 23_800_000,
	pools: {
		main: pool(65_000_000, 41_200_000),
		background: pool(5_000_000, 2_100_000),
		coding: pool(5_000_000, 400_000),
		external: pool(2_000_000, 800_000),
	},
	overflow: {
		main: { overflow: false, rate: 1, floor: null },
		background: { overflow: true, rate: 1, floor: 13_000_000 },
		coding: { overflow: true, rate: 1.2, floor: 13_000_000 },
		external: { overflow: false, rate: 1, floor: null },
	},
	configVersion: 1,
	cycle: { start: "2026-11-01T00:00:00+08:00", resetsAt: "2026-12-01T00:00:00+08:00" },
};
const zero: Record<QuotaPool, number> = { main: 0, background: 0, coding: 0, external: 0 };
const overview: UsageOverview = {
	range: { kind: "cycle", start: "2026-11-01", end: "2026-11-19" },
	totals: {
		calls: 12,
		cost: 3_000_000,
		inputTokens: 1,
		outputTokens: 1,
		cacheWriteTokens: 0,
		cacheReadTokens: 0,
		unknownUsageCalls: 0,
	},
	daily: [
		{ date: "2026-11-18", cost: { ...zero, main: 1_000_000, background: 500_000 }, calls: 5 },
		{ date: "2026-11-19", cost: { ...zero, main: 1_500_000 }, calls: 7 },
	],
	byPool: {
		main: { cost: 2_500_000, calls: 10 },
		background: { cost: 500_000, calls: 2 },
		coding: { cost: 0, calls: 0 },
		external: { cost: 0, calls: 0 },
	},
	byPurpose: [
		{ purpose: "chat", cost: 2_000_000, calls: 9, runs: 6 },
		{ purpose: "scheduled", cost: 1_000_000, calls: 3, runs: 2 },
	],
	topConversations: [],
};
vi.mock("@yonder/ui-data", () => ({
	useQuota: () => ({ data: quota }),
	useQuotaConfig: () => ({ data: { monthly: { main: 20_000_000 } } }),
	useQuotaRates: () => ({
		data: {
			quotaPerYuan: 1_000_000,
			baseline: "Standard",
			items: [{ name: "Standard", input: 1, output: 4, cacheWrite: 1, cacheRead: 0.02, multiple: 1 }],
		},
	}),
	useUsageOverview: () => ({ data: overview }),
	useUsageRuns: () => ({ data: { pages: [{ items: [] }] } }),
	useConversations: () => ({ data: { items: [] } }),
	usePerson: () => undefined,
}));

import { QuotaSection } from "./quota-section.tsx";

function show(locale: "zh-CN" | "en", onOpenPage = vi.fn()) {
	render(
		<I18nextProvider i18n={createI18n(locale)}>
			<QuotaSection onOpenPage={onOpenPage} />
		</I18nextProvider>,
	);
	return onOpenPage;
}

test("the first screen shows every pool in millions, the unit and where the quota went", () => {
	show("zh-CN");
	const main = screen.getByRole("button", { name: "查看主额度详情" });
	expect(main).toHaveTextContent("41.2M");
	expect(main).toHaveTextContent("/ 本月 65M");
	expect(main).toHaveTextContent("底线 13M");
	expect(screen.getByRole("button", { name: "查看执行详情" })).toHaveTextContent("0.4M");
	expect(screen.getByRole("button", { name: "查看执行详情" })).toHaveTextContent("用完按 1.2 倍扣主额度");
	expect(screen.getByRole("button", { name: "查看后台详情" })).toHaveTextContent("用完扣主额度");
	expect(screen.getByRole("button", { name: "查看对外详情" })).toHaveTextContent("用完不扣主额度");
	expect(screen.getByText("1M 额度 = ¥1，约 Standard 1M 输入 token")).toBeVisible();
	expect(screen.getByText("共 3M")).toBeVisible();
	expect(screen.getByRole("button", { name: /和 Bot 聊天/ })).toHaveTextContent("67%");
	// No per-call list on the first screen; it lives behind 「全部记录」.
	expect(screen.queryByText("模型调用")).toBeNull();
});

test("every figure opens the page behind it", () => {
	const open = show("en");
	fireEvent.click(screen.getByRole("button", { name: "Open Background details" }));
	fireEvent.click(screen.getByRole("button", { name: "11/18, 1.5M in total" }));
	fireEvent.click(screen.getByRole("button", { name: /Scheduled tasks/ }));
	fireEvent.click(screen.getByRole("button", { name: "All usage" }));
	expect(open.mock.calls.map(([page]) => page)).toEqual([
		"pool-background",
		"day-2026-11-18",
		"purpose-scheduled",
		"runs",
	]);
});

test("the chart has a table view with every number, so colour is never the only key", () => {
	show("en");
	fireEvent.click(screen.getByRole("button", { name: "Table" }));
	const table = screen.getByRole("table");
	const rows = within(table).getAllByRole("row");
	expect(rows[1]).toHaveTextContent("1.5M");
	expect(rows[2]).toHaveTextContent("1M");
	expect(rows[2]).toHaveTextContent("0.5M");
});
