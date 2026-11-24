// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test } from "vitest";
import { BotTabAvatar } from "./unread-badge.tsx";

test("main Bot tab shows actual unread count, muted dot, and no badge after zero", () => {
	const i18n = createI18n("en");
	const tab = (unreadCount: number, muted = false) => (
		<I18nextProvider i18n={i18n}>
			<BotTabAvatar bot={undefined} unreadCount={unreadCount} muted={muted} />
		</I18nextProvider>
	);
	const view = render(tab(3));
	const badge = () => screen.getByRole("img", { name: /3 unread/ });
	expect(badge()).toHaveTextContent("3");
	expect(within(badge()).queryByText(/unread/)).toBeNull();
	view.rerender(tab(3, true));
	expect(within(badge()).getByText(/3 unread/)).toHaveClass("sr-only");
	view.rerender(tab(0));
	expect(screen.queryByRole("img", { name: /unread/ })).not.toBeInTheDocument();
});
