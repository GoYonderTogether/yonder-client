// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

vi.mock("@yonder/ui-data", () => ({
	useUsage: () => ({
		data: {
			pages: [
				{
					items: [
						{
							id: "platform-call",
							at: "2026-11-15T00:00:00Z",
							model: "glm-5.3-flash",
							pool: "coding",
							overflow: true,
							overflowRate: 1.2,
							ok: true,
							usageKnown: true,
							cost: 20,
							inputTokens: 10,
							outputTokens: 10,
							cacheWriteTokens: 0,
							cacheReadTokens: 0,
						},
						{
							id: "user-call",
							at: "2026-11-15T00:00:00Z",
							provider: "Personal provider",
							model: "personal-model",
							pool: "main",
							overflow: false,
							overflowRate: null,
							ok: true,
							usageKnown: true,
							cost: 20,
							inputTokens: 10,
							outputTokens: 10,
							cacheWriteTokens: 0,
							cacheReadTokens: 0,
						},
					],
				},
			],
		},
	}),
}));

import { QuotaUsage } from "./quota-usage.tsx";

test("shows model-only platform usage and retains the user's own provider name", () => {
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<QuotaUsage />
		</I18nextProvider>,
	);
	expect(screen.getByText("glm-5.3-flash", { exact: true })).toBeVisible();
	expect(screen.getByText("Personal provider · personal-model")).toBeVisible();
	expect(screen.queryByText(/^·/)).toBeNull();
	// A spilled call names its pool and the multiplier it paid; a main-pool call does neither.
	expect(screen.getByText("Coding · overflow 1.2×")).toBeVisible();
	expect(screen.getByText("Main", { exact: true })).toBeVisible();
});
