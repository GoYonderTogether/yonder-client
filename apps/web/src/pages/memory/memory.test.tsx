// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Member } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { MemoryCards } from "./memory-cards.tsx";

// Exercise card state here; shell tests and browser checks cover the animated overlay lifecycle.
vi.mock("@yonder/ui-shell", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@yonder/ui-shell")>();
	return {
		...actual,
		Overlay: ({ open, title, closeLabel, onClose, children }: import("@yonder/ui-shell").OverlayProps) =>
			open ? (
				<dialog open aria-label={title}>
					<button type="button" onClick={onClose}>
						{closeLabel}
					</button>
					{children}
				</dialog>
			) : null,
	};
});

const person: Member = {
	id: "memory-check",
	kind: "person",
	handle: "memorycheck",
	displayName: "Card check",
	avatarUrl: null,
	bio: "Existing account bio",
	createdAt: "2026-01-01T00:00:00Z",
	version: 1,
};

function show(children: React.ReactNode) {
	return render(<I18nextProvider i18n={createI18n("en")}>{children}</I18nextProvider>);
}

test("the public card uses the account, switches to private AI empty state and expands both cards", () => {
	show(<MemoryCards person={person} />);
	expect(screen.getByText("Card check")).toBeVisible();
	expect(screen.getByRole("img", { name: "Scan to add me" })).toBeVisible();
	expect(screen.queryByText(person.bio as string)).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Show How AI sees me" }));
	expect(screen.getByText("Your understanding, still unfolding")).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "Expand both cards" }));
	expect(screen.getByText("Card check")).toBeVisible();
	expect(screen.getByText("Your understanding, still unfolding")).toBeVisible();
	expect(screen.getByRole("button", { name: "Stack cards" })).toHaveAttribute("aria-expanded", "true");
});

test("editing a card is a local preview with cancel and optional avatar and bio", async () => {
	const { container } = show(<MemoryCards person={person} />);
	fireEvent.click(screen.getByRole("button", { name: "Edit card" }));
	expect(screen.getByText("Preview for this visit")).toBeVisible();
	fireEvent.click(screen.getByRole("checkbox", { name: "Show avatar" }));
	fireEvent.click(screen.getByRole("checkbox", { name: "Show profile bio" }));
	fireEvent.click(screen.getByRole("button", { name: "Reading" }));
	fireEvent.click(screen.getByRole("button", { name: "Done" }));
	await waitFor(() => expect(screen.queryByText("Preview for this visit")).not.toBeInTheDocument());
	expect(container.querySelector("[data-avatar-fallback]")).toBeNull();
	expect(screen.getByText(person.bio as string)).toBeVisible();
	expect(screen.getByText("Reading")).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "Edit card" }));
	fireEvent.click(screen.getByRole("checkbox", { name: "Show avatar" }));
	fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
	await waitFor(() => expect(screen.queryByText("Preview for this visit")).not.toBeInTheDocument());
	expect(container.querySelector("[data-avatar-fallback]")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Edit card" }));
	expect(screen.getByRole("checkbox", { name: "Show avatar" })).not.toBeChecked();
	expect(screen.getByRole("checkbox", { name: "Show profile bio" })).toBeChecked();
	expect(screen.getByRole("button", { name: "Reading" })).toHaveAttribute("aria-pressed", "true");
});
