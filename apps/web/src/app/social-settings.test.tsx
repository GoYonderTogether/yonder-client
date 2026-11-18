// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryStorage, DataProvider } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { SocialDrafts, SocialInfo, SocialPersona } from "./social-settings.tsx";

test("draft approval updates shared information and persona saves only to the current Bot", async () => {
	const knowledgePath = "/v1/me/social";
	const approvePath = `${knowledgePath}/drafts/one/approve`;
	const personaPath = "/v1/bots/bot-1/social";
	const records = {
		approved: "Public fact",
		drafts: [{ id: "one", content: "Proposed fact", createdAt: "2026-11-18T00:00:00.000Z" }],
	};
	const writes: { path: string; content: string }[] = [];
	const requests: string[] = [];
	const onSaved = vi.fn();
	vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
		const path = new URL(url).pathname;
		requests.push(path);
		if (path === "/v1/auth/refresh") return Response.json({ accessToken: "isolated-social-test" });
		if (path === approvePath) {
			records.approved += "\n\nProposed fact";
			records.drafts = [];
			return Response.json(records);
		}
		if (init.method === "PUT") {
			const { content } = JSON.parse(String(init.body));
			writes.push({ path, content });
			if (path === knowledgePath) {
				records.approved = content;
				return Response.json(records);
			}
			if (path === personaPath) return Response.json({ content });
		}
		if (path === knowledgePath) return Response.json(records);
		if (path === personaPath) return Response.json({ content: "Bot persona" });
		return new Response(null, { status: 404 });
	});
	try {
		const { unmount } = render(
			<DataProvider baseUrl="http://social.test" appVersion="test" clientKind="web" storage={createMemoryStorage()}>
				<I18nextProvider i18n={createI18n("en")}>
					<SocialDrafts />
					<SocialInfo />
					<SocialPersona botId="bot-1" onSaved={onSaved} />
				</I18nextProvider>
			</DataProvider>,
		);
		expect(await screen.findByText("Proposed fact")).toBeVisible();
		expect(requests).not.toContain(approvePath);
		fireEvent.click(screen.getByRole("button", { name: "Approve and publish" }));
		const info = await screen.findByLabelText("Published information");
		await waitFor(() => expect(info).toHaveValue("Public fact\n\nProposed fact"));
		fireEvent.change(info, { target: { value: "Updated public fact" } });
		fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0] as HTMLElement);
		await waitFor(() => expect(screen.getByText("Saved", { exact: true })).toBeVisible());
		const persona = await screen.findByLabelText("Communication style");
		fireEvent.change(persona, { target: { value: "Updated persona" } });
		fireEvent.click(screen.getAllByRole("button", { name: "Save" })[1] as HTMLElement);
		await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
		expect(writes).toEqual([
			{ path: knowledgePath, content: "Updated public fact" },
			{ path: personaPath, content: "Updated persona" },
		]);
		unmount();
	} finally {
		vi.unstubAllGlobals();
	}
});
