// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { MeCard } from "./me-card.tsx";

function show(person: Parameters<typeof MeCard>[0]["person"], selected = false) {
	const open = vi.fn();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<MeCard person={person} selected={selected} onOpen={open} />
		</I18nextProvider>,
	);
	return open;
}

test("the whole face opens the profile editor and shows name, ID and bio", () => {
	const open = show({ displayName: "A person", handle: "person", avatarUrl: null, bio: "Writes slowly." });
	const card = screen.getByRole("button", { name: "Edit profile" });
	expect(card).toHaveTextContent("A person");
	expect(card).toHaveTextContent("@person");
	expect(card).toHaveTextContent("Writes slowly.");
	fireEvent.click(card);
	expect(open).toHaveBeenCalledTimes(1);
});

test("without a bio the card shows no empty line, and the open page is marked", () => {
	show({ displayName: "A person", handle: "person", avatarUrl: null, bio: null }, true);
	const card = screen.getByRole("button", { name: "Edit profile" });
	expect(card.querySelector(".me-card-bio")).toBeNull();
	expect(card).toHaveAttribute("aria-current", "true");
});
