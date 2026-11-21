// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryStorage, DataProvider } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { SocialPersona } from "./social-settings.tsx";

test("persona saves only to the current Bot", async () => {
	const personaPath = "/v1/bots/bot-1/social";
	const writes: { path: string; content: string }[] = [];
	const onSaved = vi.fn();
	vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
		const path = new URL(url).pathname;
		if (path === "/v1/auth/refresh") return Response.json({ accessToken: "isolated-social-test" });
		if (path === personaPath && init.method === "PUT") {
			const { content } = JSON.parse(String(init.body));
			writes.push({ path, content });
			return Response.json({ content });
		}
		if (path === personaPath) return Response.json({ content: "Bot persona" });
		return new Response(null, { status: 404 });
	});
	try {
		const { unmount } = render(
			<DataProvider baseUrl="http://social.test" appVersion="test" clientKind="web" storage={createMemoryStorage()}>
				<I18nextProvider i18n={createI18n("en")}>
					<SocialPersona botId="bot-1" onSaved={onSaved} />
				</I18nextProvider>
			</DataProvider>,
		);
		const persona = await screen.findByLabelText("Communication style");
		fireEvent.change(persona, { target: { value: "Updated persona" } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
		expect(writes).toEqual([{ path: personaPath, content: "Updated persona" }]);
		unmount();
	} finally {
		vi.unstubAllGlobals();
	}
});
