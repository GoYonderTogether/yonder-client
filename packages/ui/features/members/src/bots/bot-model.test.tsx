// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { Member } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("@yonder/ui-data", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yonder/ui-data")>()),
	useProviders: () => ({
		data: {
			platformModels: [{ id: "mdl_plat", name: "DeepSeek", enabled: true, isDefault: true }],
			items: [
				{
					id: "prv_mine",
					scope: "user",
					name: "Mine",
					baseUrl: "https://x.example",
					protocol: "openai-chat",
					models: ["m"],
					enabled: true,
					keyConfigured: true,
					isDefault: false,
					origin: "cloud",
				},
				{
					id: "prv_nokey",
					scope: "user",
					name: "No key",
					baseUrl: "https://y.example",
					protocol: "openai-chat",
					models: ["m"],
					enabled: true,
					keyConfigured: false,
					isDefault: false,
					origin: "cloud",
				},
			],
		},
	}),
	useUpdateBot: () => ({ mutate, isPending: false, isError: false, isSuccess: false }),
}));

import { BotModelPage } from "./bot-model.tsx";

const bot = (modelChoice: string | null): Member =>
	({ id: "bot_1", kind: "bot", displayName: "B", modelChoice }) as unknown as Member;

function show(member: Member) {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<BotModelPage bot={member} />
		</I18nextProvider>,
	);
}

test("a Bot with no choice follows the main model, and picking a row saves its id", async () => {
	show(bot(null));
	expect(screen.getByRole("radio", { name: "Follow the main model" })).toBeChecked();
	await userEvent.click(screen.getByRole("radio", { name: "Mine" }));
	expect(mutate).toHaveBeenCalledWith({ id: "bot_1", modelChoice: "prv_mine" });
});

test("choosing 「follow」 clears the Bot's own choice", async () => {
	show(bot("prv_mine"));
	expect(screen.getByRole("radio", { name: "Mine" })).toBeChecked();
	await userEvent.click(screen.getByRole("radio", { name: "Follow the main model" }));
	expect(mutate).toHaveBeenLastCalledWith({ id: "bot_1", modelChoice: null });
});

test("a provider without a key cannot be picked, and a choice that no longer exists reads as following", () => {
	show(bot("prv_gone"));
	expect(screen.getByRole("radio", { name: "No key" })).toBeDisabled();
	expect(screen.getByRole("radio", { name: "Follow the main model" })).toBeChecked();
});
