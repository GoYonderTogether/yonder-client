// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { expect, test } from "vitest";
import { usePageNavigation } from "./use-page-navigation.ts";
import { MAIN_BOT_PATH, usePhoneTabs } from "./use-phone-tabs.ts";

function Harness({ phone, receive }: { phone: boolean; receive: (tabs: ReturnType<typeof usePhoneTabs>) => void }) {
	const location = useLocation();
	const navigation = usePageNavigation(location.pathname);
	receive(usePhoneTabs(navigation, phone, location.pathname === MAIN_BOT_PATH));
	return null;
}

function setup(path: string, phone = true) {
	let tabs: ReturnType<typeof usePhoneTabs>;
	const element = (
		<Harness
			phone={phone}
			receive={(value) => {
				tabs = value;
			}}
		/>
	);
	const router = createMemoryRouter([{ path: "*", element }], { initialEntries: [path] });
	render(<RouterProvider router={router} />);
	return {
		router,
		go: async (target: string) => act(async () => void (await tabs.go(target))),
		back: () => tabs.backToMainBot(),
	};
}

test("tab roots replace each other above the main Bot, which stays beneath them", async () => {
	const { router, go } = setup(MAIN_BOT_PATH);
	const start = router.state.location.key;
	await go("/tasks");
	await go("/memory");
	expect(router.state.location.pathname).toBe("/memory");
	expect(router.state.historyAction).toBe("REPLACE");
	await go(MAIN_BOT_PATH);
	expect(router.state.location.pathname).toBe(MAIN_BOT_PATH);
	expect(router.state.location.key).toBe(start);
	// Browser and Android Back from the main Bot now leave the app instead of stepping through tabs.
	await act(async () => router.navigate(-1));
	expect(router.state.location.pathname).toBe(MAIN_BOT_PATH);
});

test("pages below a tab root still push, and back from one opened on the main Bot returns there", async () => {
	const { router, go, back } = setup(MAIN_BOT_PATH);
	await go("/tasks/item-1");
	expect(router.state.historyAction).toBe("PUSH");
	await act(async () => void back());
	expect(router.state.location.pathname).toBe(MAIN_BOT_PATH);
});

test("the main Bot row in Messages switches tabs rather than pushing a page", async () => {
	const { router, go } = setup(MAIN_BOT_PATH);
	await go("/messages");
	await go(MAIN_BOT_PATH);
	await go("/messages");
	expect(router.state.location.pathname).toBe("/messages");
	await act(async () => router.navigate(-1));
	expect(router.state.location.pathname).toBe(MAIN_BOT_PATH);
});

test("a computer opens every destination as a new entry", async () => {
	const { router, go, back } = setup("/messages", false);
	await go("/tasks");
	expect(router.state.historyAction).toBe("PUSH");
	expect(back()).toBe(false);
});
