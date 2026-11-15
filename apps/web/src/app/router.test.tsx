// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryStorage, DataProvider } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { createBrowserRouter, RouterProvider } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { AppRoutes } from "./router.tsx";

function renderAt(path: string) {
	window.history.replaceState({ idx: 0 }, "", path);
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
	const router = createBrowserRouter([{ path: "*", element: <AppRoutes /> }]);
	render(
		<DataProvider baseUrl="" appVersion="test" clientKind="web" storage={createMemoryStorage()}>
			<I18nextProvider i18n={createI18n("en")}>
				<RouterProvider router={router} />
			</I18nextProvider>
		</DataProvider>,
	);
	return router;
}

afterEach(() => vi.unstubAllGlobals());

test("both legal routes are public and a direct visit returns to the home route", async () => {
	window.history.pushState({}, "", "/blank");
	const router = renderAt("/terms");
	expect(screen.getByRole("heading", { name: "Terms of Service" })).toBeInTheDocument();
	await router.navigate("/privacy", { replace: true });
	expect(await screen.findByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Back" }));
	await waitFor(() => expect(router.state.location.pathname).toBe("/"));
	router.dispose();
});

test("opening both legal pages keeps the sign-in draft and restores focus", async () => {
	const router = renderAt("/sign-in");
	fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "13800138000" } });
	for (const [label, title] of [
		["Terms of service", "Terms of Service"],
		["Privacy policy", "Privacy Policy"],
	] as const) {
		fireEvent.click(screen.getByRole("link", { name: label }));
		expect(await screen.findByRole("heading", { name: title })).toBeVisible();
		expect(screen.getByLabelText("Phone number")).not.toBeVisible();
		expect(screen.queryByRole("textbox", { name: "Phone number" })).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Back" }));
		await waitFor(() => expect(screen.getByLabelText("Phone number")).toHaveValue("138 0013 8000"));
		// Focus returns on the next animation frame, which jsdom runs late when the suite is busy.
		await waitFor(() => expect(screen.getByRole("link", { name: label })).toHaveFocus(), { timeout: 3000 });
	}
	router.dispose();
});
