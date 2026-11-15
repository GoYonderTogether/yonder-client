// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

vi.mock("@yonder/ui-data", () => ({
	useProviders: () => ({
		data: {
			items: [
				{
					id: "platform",
					scope: "platform",
					name: "RightCode",
					baseUrl: "https://example.org",
					models: ["glm-5.3-flash", "another-model"],
					enabled: true,
					keyConfigured: true,
					isDefault: true,
				},
				{
					id: "user",
					scope: "user",
					name: "Personal provider",
					baseUrl: "https://example.net",
					models: ["personal-model"],
					enabled: true,
					keyConfigured: true,
					isDefault: false,
				},
			],
		},
	}),
	useProviderActions: () => ({ setDefault: {}, remove: {}, test: {} }),
}));

import { ModelsSection } from "./models-section.tsx";

test.each([
	["zh-CN", "平台供应商", "模型：glm-5.3-flash, another-model", "模型：personal-model", "使用中"],
	["en", "Platform provider", "Models: glm-5.3-flash, another-model", "Models: personal-model", "In use"],
] as const)("shows provider scope and model names in %s", (locale, platform, platformModels, userModels, active) => {
	render(
		<I18nextProvider i18n={createI18n(locale)}>
			<ModelsSection page={null} onOpenPage={() => {}} />
		</I18nextProvider>,
	);
	const platformRow = screen.getByText("RightCode", { exact: false }).closest("li");
	const userRow = screen.getByText("Personal provider").closest("li");
	if (!platformRow || !userRow) throw new Error("provider row missing");
	expect(within(platformRow).getByText(platform)).toBeVisible();
	expect(within(platformRow).getByText(platformModels)).toBeVisible();
	expect(within(platformRow).getByText(active)).toBeVisible();
	expect(within(userRow).queryByText(platform)).toBeNull();
	expect(within(userRow).getByText(userModels)).toBeVisible();
});
