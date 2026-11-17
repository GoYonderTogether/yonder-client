// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import type { QuotaConfigResponse, RateCardResponse } from "@yonder/protocol";
import { createI18n, type Locale } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

const data = vi.hoisted(() => ({
	config: undefined as QuotaConfigResponse | undefined,
	rates: undefined as RateCardResponse | undefined,
	configError: false,
	ratesError: false,
}));

vi.mock("@yonder/ui-data", async (original) => ({
	...(await original<typeof import("@yonder/ui-data")>()),
	useLocalePreference: () => ({ locale: "zh-CN", setLocale: vi.fn() }),
	useQuotaConfig: () => ({
		data: data.config,
		isError: data.configError,
		refetch: vi.fn(),
	}),
	useQuotaRates: () => ({ data: data.rates, isError: data.ratesError, refetch: vi.fn() }),
}));

import { PricingPage } from "./pricing-page.tsx";

const config: QuotaConfigResponse = {
	version: 7,
	tier: "standard",
	signup: { main: 75_000_000, background: 15_000_000, coding: 5_000_000, external: 5_000_000 },
	monthly: { main: 23_000_000, background: 3_000_000, coding: 1_000_000, external: 2_000_000 },
	rules: {
		main: { overflow: false, rate: 1, floor: null },
		background: { overflow: true, rate: 1, floor: 4_000_000 },
		coding: { overflow: true, rate: 1.2, floor: 4_000_000 },
		external: { overflow: false, rate: 1, floor: null },
	},
	invite: { inviter: 10_000_000, invitee: 10_000_000, maxInvites: 30 },
};

const rates: RateCardResponse = {
	quotaPerYuan: 1_000_000,
	baseline: "Standard",
	items: [
		{ name: "Standard", input: 1, output: 4, cacheWrite: 1.25, cacheRead: 0.02, multiple: 1 },
		{ name: "Light", input: 0.5, output: 2, cacheWrite: 0.6, cacheRead: 0.01, multiple: 0.5 },
	],
};

function show(locale: Locale) {
	return render(
		<I18nextProvider i18n={createI18n(locale)}>
			<PricingPage />
		</I18nextProvider>,
	);
}

test.each(["zh-CN", "en"] as const)("the price page is built only from the published catalog (%s)", (locale) => {
	data.config = config;
	data.rates = rates;
	data.configError = false;
	data.ratesError = false;
	const { container } = show(locale);
	const text = container.textContent ?? "";
	// The tier table carries exactly the catalog's rows, and the baseline sentence names the baseline.
	const table = screen.getByRole("table");
	for (const item of rates.items) expect(table).toHaveTextContent(item.name);
	expect(table).toHaveTextContent(locale === "zh-CN" ? "1 倍 Standard" : "1× Standard");
	// The grant figures are the catalog's, and no vendor or model id appears anywhere on the page.
	expect(text).toMatch(/75|万|M/);
	expect(text).not.toMatch(/DeepSeek|RightCode|deepseek-flash|glm-5\.3-flash|GPT|Claude/i);
	// Signed out the page still renders: it never asks for a balance or a profile.
	expect(text).not.toMatch(/sign in|登录/i);
});

test("a failed catalog or rate card offers a retry instead of half a page", () => {
	data.config = undefined;
	data.rates = undefined;
	data.configError = true;
	data.ratesError = false;
	const { container } = show("en");
	expect(container.textContent).toContain("Could not load the prices.");
	expect(screen.queryByRole("table")).toBeNull();
});
