// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryStorage, DataProvider, useSessionStore } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { createBrowserRouter, RouterProvider } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { AppRoutes } from "./router.tsx";

const card = {
	kind: "person",
	handle: "abc123xyz",
	displayName: "A person",
	avatarUrl: null,
	bio: null,
	owner: null,
};

/** One fetch answer for whichever card route the reader lands on. */
function respond(body: unknown, status = 200) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			if (url.includes("/v1/members/")) {
				return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
			}
			return new Response("{}", { status: 401 });
		}),
	);
}

function renderAt(path: string) {
	window.history.replaceState({ idx: 0 }, "", path);
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

afterEach(() => {
	vi.unstubAllGlobals();
	useSessionStore.setState({ booting: false, status: "signed-out" });
});

test.each(["/@abc123xyz", "/@abc123xyz/", "/@ABC"])(
	"a signed-out reader sees the public card at %s",
	async (path) => {
		respond({ card });
		useSessionStore.setState({ booting: false, status: "signed-out" });
		const router = renderAt(path);
		expect(await screen.findByRole("heading", { name: "A person" }, { timeout: 10000 })).toBeVisible();
		expect(screen.getByRole("button", { name: "Sign in to add" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Download Yonder" })).toBeVisible();
		router.dispose();
	},
);

test("`/@` alone and an ordinary path are not cards", async () => {
	respond({ card });
	useSessionStore.setState({ booting: false, status: "signed-out" });
	const router = renderAt("/@");
	// With no card to render, `/@` falls through to the routes the app already had; a card heading
	// would mean the guard had read it as a handle.
	await screen.findByText(/Sign in|Yonder/i, {}, { timeout: 10000 }).catch(() => {});
	expect(screen.queryByRole("heading", { name: "A person" })).toBeNull();
	await router.navigate("/sign-in");
	expect(screen.queryByRole("heading", { name: "A person" })).toBeNull();
	router.dispose();
});

test("a handle the server does not answer is one neutral not-found, with no reason", async () => {
	respond({ code: "not_found" }, 404);
	useSessionStore.setState({ booting: false, status: "signed-out" });
	const router = renderAt("/@gone12345");
	expect(await screen.findByRole("heading", { name: "This page does not exist" }, { timeout: 10000 })).toBeVisible();
	expect(screen.queryByText(/closed|private|deleted/i)).toBeNull();
	router.dispose();
});
