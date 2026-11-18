// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { QuotaResponse } from "@yonder/protocol";
import { createI18n, type Locale } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { exhaustedPools, QuotaLowBanner } from "./quota-low-banner.tsx";

const pool = (remaining: number, granted = 10_000_000) => ({
	granted,
	used: granted - remaining,
	remaining,
	remainingPercent: granted === 0 ? 0 : Math.round((remaining / granted) * 100),
});

/**
 * The default catalog: background and coding draw on main at a 4,000,000 floor, external never
 * draws, main never spills anywhere.
 */
const quota = (remaining: {
	main: number;
	background?: number;
	coding?: number;
	external?: number;
	tools?: number;
}): QuotaResponse => ({
	balance: remaining.main,
	granted: 10_000_000,
	used: 10_000_000 - remaining.main,
	pools: {
		main: pool(remaining.main),
		background: pool(remaining.background ?? 1_000_000),
		coding: pool(remaining.coding ?? 1_000_000),
		external: pool(remaining.external ?? 1_000_000),
		tools: pool(remaining.tools ?? 1_000_000),
	},
	overflow: {
		main: { overflow: false, rate: 1, floor: null },
		background: { overflow: true, rate: 1, floor: 4_000_000 },
		coding: { overflow: true, rate: 1.2, floor: 4_000_000 },
		external: { overflow: false, rate: 1, floor: null },
		tools: { overflow: false, rate: 1, floor: null },
	},
	configVersion: 1,
	cycle: { start: "2026-11-01T00:00:00.000Z", resetsAt: "2026-12-01T00:00:00.000Z" },
});

function show(value: QuotaResponse, locale: Locale, onOpenInvite = vi.fn(), onOpenUsage = vi.fn()) {
	render(
		<I18nextProvider i18n={createI18n(locale)}>
			<QuotaLowBanner quota={value} onOpenInvite={onOpenInvite} onOpenUsage={onOpenUsage} />
		</I18nextProvider>,
	);
	return { onOpenInvite, onOpenUsage };
}

test("a healthy balance shows nothing at all", () => {
	const { container } = render(
		<I18nextProvider i18n={createI18n("en")}>
			<QuotaLowBanner quota={quota({ main: 9_000_000 })} onOpenInvite={vi.fn()} onOpenUsage={vi.fn()} />
		</I18nextProvider>,
	);
	expect(container).toBeEmptyDOMElement();
});

test.each([
	["zh-CN", "已用完：主额度", "2026年12月1日", "邀请好友得额度", "查看用量"],
	["en", "Used up: Main", "Dec 1, 2026", "Invite a friend for quota", "See usage"],
] as const)(
	"%s names the pool, the reset date and both exits, and offers nothing to buy",
	(locale, used, reset, invite, usage) => {
		const { onOpenInvite, onOpenUsage } = show(quota({ main: 0 }), locale);
		expect(screen.getByRole("status")).toHaveTextContent(used);
		expect(screen.getByRole("status")).toHaveTextContent(reset);
		expect(screen.queryByRole("button", { name: /buy|purchase|upgrade|购买|充值/i })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: invite }));
		fireEvent.click(screen.getByRole("button", { name: usage }));
		expect(onOpenInvite).toHaveBeenCalledTimes(1);
		expect(onOpenUsage).toHaveBeenCalledTimes(1);
	},
);

test("a pool that can still draw on main is not reported as used up", () => {
	// Background and coding are empty, but main is far above the floor, so they keep answering.
	const spilling = { ...quota({ main: 9_000_000 }), pools: { ...quota({ main: 9_000_000 }).pools } };
	spilling.pools.background = pool(0);
	spilling.pools.coding = pool(0);
	expect(exhaustedPools(spilling)).toEqual([]);
	// At the floor the draw stops, so those two pools really are spent.
	const atFloor = { ...spilling, pools: { ...spilling.pools, main: pool(4_000_000) } };
	expect(exhaustedPools(atFloor)).toEqual(["background", "coding"]);
});

test("external is never what stops this account's own chat", () => {
	// It pays for other people talking to this Bot, so an empty external pool leaves the chat banner quiet.
	const value = { ...quota({ main: 9_000_000 }), pools: { ...quota({ main: 9_000_000 }).pools, external: pool(0) } };
	expect(exhaustedPools(value)).toEqual([]);
});

test("the main pool is named once it is empty, whatever the other pools hold", () => {
	expect(exhaustedPools(quota({ main: 0 }))).toEqual(["main"]);
});
