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

test("the price page is public and paints from the two published endpoints, with no session", async () => {
	const requested: string[] = [];
	const catalog = {
		version: 3,
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
	const rates = {
		quotaPerYuan: 1_000_000,
		baseline: "Standard",
		items: [{ name: "Standard", input: 1, output: 4, cacheWrite: 1.25, cacheRead: 0.02, multiple: 1 }],
	};
	const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
		requested.push(url);
		// A public page sends no credentials, and `/v1/auth/refresh` is the only thing a signed-out
		// boot may ask for. Anything else is a sign the page wanted a session it should not need.
		const headers = new Headers(init.headers);
		expect(headers.get("authorization")).toBeNull();
		if (url.endsWith("/v1/quota/rates")) return jsonResponse(rates);
		if (url.endsWith("/v1/quota/config")) return jsonResponse(catalog, { headers: { etag: '"3"' } });
		return new Response("{}", { status: 401 });
	});
	vi.stubGlobal("fetch", fetchImpl);
	window.history.replaceState({ idx: 0 }, "", "/pricing");
	const router = createBrowserRouter([{ path: "*", element: <AppRoutes /> }]);
	render(
		<DataProvider baseUrl="" appVersion="test" clientKind="web" storage={createMemoryStorage()}>
			<I18nextProvider i18n={createI18n("en")}>
				<RouterProvider router={router} />
			</I18nextProvider>
		</DataProvider>,
	);
	expect(await screen.findByRole("heading", { name: "Prices" }, { timeout: 10000 })).toBeInTheDocument();
	expect(await screen.findByRole("table")).toHaveTextContent("Standard");
	expect(requested.some((url) => url.endsWith("/v1/quota/config"))).toBe(true);
	expect(requested.some((url) => url.endsWith("/v1/quota/rates"))).toBe(true);
	router.dispose();
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
		...init,
	});
}

test("both legal routes are public and a direct visit returns to the home route", async () => {
	window.history.pushState({}, "", "/blank");
	const router = renderAt("/terms");
	expect(await screen.findByRole("heading", { name: "Terms of Service" }, { timeout: 10000 })).toBeInTheDocument();
	await router.navigate("/privacy", { replace: true });
	expect(await screen.findByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Back" }));
	await waitFor(() => expect(router.state.location.pathname).toBe("/"));
	router.dispose();
});

test("opening both legal pages keeps the sign-in draft and restores focus", async () => {
	const router = renderAt("/sign-in");
	fireEvent.change(await screen.findByLabelText("Phone number", {}, { timeout: 10000 }), {
		target: { value: "13800138000" },
	});
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
