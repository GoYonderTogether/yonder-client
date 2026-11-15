// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { usePageNavigation } from "./use-page-navigation.ts";

function Harness({ receive }: { receive: (value: ReturnType<typeof usePageNavigation>) => void }) {
	receive(usePageNavigation("/messages/main?from=list#latest"));
	return null;
}

function setup(path: string) {
	let navigation: ReturnType<typeof usePageNavigation>;
	const router = createMemoryRouter(
		[
			{
				path: "*",
				element: (
					<Harness
						receive={(value) => {
							navigation = value;
						}}
					/>
				),
			},
		],
		{ initialEntries: [path] },
	);
	render(<RouterProvider router={router} />);
	return {
		router,
		open: (target: string) => navigation.open(target),
		back: (parent: string) => navigation.back(parent),
	};
}

test("back consumes visited parents and restores the original tab entry", async () => {
	const { router, open, back } = setup("/messages/main?from=list#latest");
	const rootKey = router.state.location.key;
	for (const path of ["/me", "/me/account", "/me/account/password"]) {
		await act(() => open(path));
		expect(router.state.historyAction).toBe("PUSH");
	}
	for (const path of ["/me/account", "/me", "/messages/main?from=list#latest"]) {
		await act(() => back(path));
		expect(router.state.historyAction).toBe("POP");
		expect(`${router.state.location.pathname}${router.state.location.search}${router.state.location.hash}`).toBe(path);
	}
	expect(router.state.location.key).toBe(rootKey);
	await act(() => router.navigate(1));
	expect(router.state.location.pathname).toBe("/me");
	await act(() => back("/messages/main?from=list#latest"));
	expect(router.state.location.key).toBe(rootKey);
	router.dispose();
});

test("deep links replace themselves with a parent instead of creating a return loop", async () => {
	const { router, back } = setup("/me/account/password");
	for (const path of ["/me/account", "/me", "/messages/main?from=list#latest"]) {
		await act(() => back(path));
		expect(router.state.historyAction).toBe("REPLACE");
		expect(`${router.state.location.pathname}${router.state.location.search}${router.state.location.hash}`).toBe(path);
	}
	await act(() => router.navigate(-1));
	expect(router.state.location.pathname).toBe("/messages/main");
	router.dispose();
});

test("opening a new child after browser Back discards the old forward branch", async () => {
	const { router, open, back } = setup("/messages/main?from=list#latest");
	await act(() => open("/me"));
	const meKey = router.state.location.key;
	await act(() => open("/me/models"));
	await act(() => router.navigate(-1));
	await act(() => open("/me/account"));
	await act(() => back("/me"));
	expect(router.state.location.key).toBe(meKey);
	await act(() => router.navigate(1));
	expect(router.state.location.pathname).toBe("/me/account");
	expect(router.state.location.state).toEqual({ tabLocation: "/messages/main?from=list#latest" });
	router.dispose();
});
