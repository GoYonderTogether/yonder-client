// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	socialKnowledge: vi.fn().mockResolvedValue({
		approved: "Public fact",
		drafts: [{ id: "one", content: "Proposed fact", createdAt: "2026-11-18" }],
	}),
	socialDraft: vi.fn().mockResolvedValue({ approved: "Public fact\n\nProposed fact", drafts: [] }),
	botSocial: vi.fn().mockResolvedValue({ content: "Bot persona" }),
	saveBotSocial: vi.fn().mockResolvedValue({ content: "Updated persona" }),
}));
vi.mock("@yonder/ui-data", () => ({
	useApi: () => mocks,
	usePerson: () => ({ id: "owner" }),
	useContacts: () => ({ data: { items: [] } }),
	ownedBots: () => [{ id: "bot-1", displayName: "Bot one" }],
}));

import { SocialSettings } from "./social-settings.tsx";

test("owner reviews a draft and edits a selected Bot's social persona", async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<I18nextProvider i18n={createI18n("en")}>
				<SocialSettings />
			</I18nextProvider>
		</QueryClientProvider>,
	);
	expect(await screen.findByText("Proposed fact")).toBeVisible();
	await waitFor(() => expect(mocks.socialDraft).not.toHaveBeenCalled());
	fireEvent.click(screen.getByRole("button", { name: "Approve and publish" }));
	await waitFor(() => expect(mocks.socialDraft).toHaveBeenCalledWith("one", true));
	fireEvent.change(screen.getByLabelText("Choose a Bot to edit its public persona"), { target: { value: "bot-1" } });
	const persona = await screen.findByLabelText("This Bot's public persona (social.md)");
	fireEvent.change(persona, { target: { value: "Updated persona" } });
	fireEvent.click(screen.getAllByRole("button", { name: "Save" })[1] as HTMLElement);
	await waitFor(() => expect(mocks.saveBotSocial).toHaveBeenCalledWith("bot-1", "Updated persona"));
});
