// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createI18n, type Locale } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

const setDefault = vi.hoisted(() => vi.fn());
vi.mock("@yonder/ui-data", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yonder/ui-data")>()),
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
					origin: "cloud",
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
					origin: "cloud",
				},
			],
			platformModels: [
				{ id: "mdl-glm", name: "glm-5.3-flash", enabled: true, isDefault: true },
				{
					id: "mdl-deepseek",
					providerId: "platform-2",
					name: "DeepSeek-V4.1-Flash-1017",
					enabled: true,
					isDefault: false,
				},
			],
		},
	}),
	useDevices: () => ({ data: { items: [] } }),
	useProviderActions: () => ({
		setDefault: { mutate: setDefault, isPending: false, isError: false, isSuccess: false },
		remove: {},
		test: {},
	}),
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
	["zh-CN", "编辑供应商", "搜索模型或供应商", "主模型"],
	["en", "Edit provider", "Search models or providers", "Main model"],
] as const)(
	"lists platform models without vendor metadata and keeps custom management in %s",
	(locale, edit, searchLabel, mainTitle) => {
		show(locale);
		const search = screen.getByRole("searchbox", { name: searchLabel });
		expect(search).toBeVisible();
		expect(search).toHaveAttribute("placeholder", searchLabel);
		expect(screen.getByText(mainTitle)).toBeVisible();
		const userRow = screen.getByText("Personal provider", { selector: "p, p *" }).closest("li");
		if (!userRow) throw new Error("provider row missing");
		// Platform models are choices in the main-model list; nothing about the vendor is shown.
		expect(screen.getByRole("radio", { name: "DeepSeek-V4.1-Flash-1017" })).toBeVisible();
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

test("searches the person's own providers, without searching hidden vendor metadata", async () => {
	show();
	const user = userEvent.setup();
	const search = screen.getByRole("searchbox");
	await user.type(search, "personal-model");
	expect(screen.getByText("Personal provider", { selector: "p, p *" })).toBeVisible();
	await user.clear(search);
	await user.type(search, "RightCode");
	expect(screen.getByText("No matching models or custom providers")).toBeVisible();
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

test("provider actions open outside the clipped list and return focus on Escape", async () => {
	const onOpenPage = vi.fn();
	const user = userEvent.setup();
	show("en", null, onOpenPage);
	const trigger = screen.getByRole("button", { name: "More actions" });
	await user.click(trigger);
	const dialog = screen.getByRole("dialog", { name: "Personal provider" });
	expect(dialog.closest("ul")).toBeNull();
	expect(within(dialog).getByRole("button", { name: "Test connection" })).toBeVisible();
	expect(within(dialog).getByRole("button", { name: "Delete provider" })).toBeEnabled();
	await user.keyboard("{Escape}");
	expect(trigger).toHaveAttribute("aria-expanded", "false");
	expect(trigger).toHaveFocus();
	await user.keyboard("{Enter}");
	await user.click(
		within(screen.getByRole("dialog", { name: "Personal provider" })).getByRole("button", { name: "Duplicate" }),
	);
	expect(onOpenPage).toHaveBeenCalledWith("duplicate-user");
});

test("the main model is one list of platform models and own providers, and picking one saves its provider", async () => {
	show("en");
	const group = screen.getByText("Main model").closest("section") ?? document.body;
	const radios = within(group as HTMLElement).getAllByRole("radio");
	expect(radios.map((radio) => radio.getAttribute("aria-label"))).toEqual([
		"glm-5.3-flash",
		"DeepSeek-V4.1-Flash-1017",
		"Personal provider",
	]);
	expect(radios[0]).toBeChecked();
	await userEvent.click(radios[2] as HTMLElement);
	expect(setDefault).toHaveBeenCalledWith("user");
});
