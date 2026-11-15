// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createI18n, type Locale } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

vi.mock("@yonder/ui-data", () => ({
	useProviders: () => ({
		data: {
			// A stale response from an older server must not expose platform details either.
			items: [
				{
					id: "platform",
					scope: "platform",
					name: "RightCode",
					baseUrl: "https://upstream.example.org",
					protocol: "openai",
					note: "private platform note",
					website: "https://vendor.example.org",
					models: ["glm-5.3-flash", "another-model"],
					enabled: true,
					keyConfigured: true,
					isDefault: true,
				},
				{
					id: "user",
					scope: "user",
					name: "Personal provider",
					baseUrl: "https://personal.example.net",
					protocol: "openai",
					models: ["personal-model"],
					enabled: true,
					keyConfigured: true,
					isDefault: false,
				},
			],
			platformModels: [
				{ id: "mdl-glm", name: "glm-5.3-flash", enabled: true, isDefault: true },
				{ id: "mdl-deepseek", name: "DeepSeek-V4.1-Flash-1017", enabled: true, isDefault: false },
			],
		},
	}),
	useProviderActions: () => ({ setDefault: {}, remove: {}, test: {} }),
}));

import { ModelsSection } from "./models-section.tsx";

function show(locale: Locale = "en", page: string | null = null, onOpenPage = vi.fn()) {
	return render(
		<I18nextProvider i18n={createI18n(locale)}>
			<ModelsSection page={page} onOpenPage={onOpenPage} />
		</I18nextProvider>,
	);
}

test.each([
	["zh-CN", "使用中", "编辑供应商", "搜索模型或供应商"],
	["en", "In use", "Edit provider", "Search models or providers"],
] as const)(
	"shows platform models without vendor metadata and retains custom management in %s",
	(locale, active, edit, searchLabel) => {
		show(locale);
		const search = screen.getByRole("searchbox", { name: searchLabel });
		expect(search).toBeVisible();
		expect(search).toHaveAttribute("placeholder", searchLabel);
		expect(search.previousElementSibling).toHaveClass("lucide-search");
		expect(screen.queryByText(searchLabel)).toBeNull();
		expect(search.parentElement?.querySelector("svg.lucide-search")).toHaveAttribute("aria-hidden", "true");
		const platformRow = screen.getByText("glm-5.3-flash").closest("li");
		const userRow = screen.getByText("Personal provider").closest("li");
		if (!platformRow || !userRow) throw new Error("model or provider row missing");
		expect(screen.getByText("DeepSeek-V4.1-Flash-1017")).toBeVisible();
		expect(within(platformRow).getByText(active)).toBeVisible();
		expect(within(platformRow).queryByRole("button")).toBeNull();
		expect(
			screen.queryByText(
				/RightCode|upstream\.example|vendor\.example|private platform|another-model|平台供应商|Platform provider/,
			),
		).toBeNull();
		expect(within(userRow).getByText("https://personal.example.net")).toBeVisible();
		expect(within(userRow).getByText(/personal-model/)).toBeVisible();
		expect(within(userRow).getByRole("button", { name: edit })).toBeVisible();
	},
);

test("searches platform and custom model names, without searching hidden vendor metadata", async () => {
	show();
	const user = userEvent.setup();
	const search = screen.getByRole("searchbox");
	await user.type(search, "FLASH-1017");
	expect(screen.getByText("DeepSeek-V4.1-Flash-1017")).toBeVisible();
	expect(screen.queryByText("glm-5.3-flash")).toBeNull();
	await user.clear(search);
	await user.type(search, "personal-model");
	expect(screen.getByText("Personal provider")).toBeVisible();
	await user.clear(search);
	await user.type(search, "RightCode");
	expect(screen.getByText("No matching models or custom providers")).toBeVisible();
	expect(screen.queryByText("glm-5.3-flash")).toBeNull();
});

test.each(["edit-platform", "duplicate-platform"])("blocks platform metadata through legacy %s deep links", (page) => {
	show("en", page);
	expect(screen.queryByRole("textbox")).toBeNull();
	expect(screen.queryByDisplayValue("RightCode")).toBeNull();
	expect(screen.getByRole("status")).toBeVisible();
});

test("retains the custom provider editing action", async () => {
	const onOpenPage = vi.fn();
	show("en", null, onOpenPage);
	await userEvent.click(screen.getByRole("button", { name: "Edit provider" }));
	expect(onOpenPage).toHaveBeenCalledWith("edit-user");
});
