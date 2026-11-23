// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { TaskActions } from "./task-actions.tsx";

function show({ manual = true }: { manual?: boolean } = {}) {
	const add = vi.fn();
	const create = vi.fn();
	const createManually = vi.fn();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<TaskActions
				onAdd={add}
				onCreateSchedule={create}
				{...(manual ? { onCreateScheduleManually: createManually } : {})}
			/>
		</I18nextProvider>,
	);
	return { add, create, createManually, plus: screen.getByRole("button", { name: "Create" }) };
}

test("the plus is one menu on both tabs: a draft, and a scheduled task either way", () => {
	const { add, create, createManually, plus } = show();
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	fireEvent.click(plus);
	expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
		"New item",
		"New goal",
		"New scheduled task",
		"Create scheduled task manually",
	]);
	fireEvent.click(screen.getByRole("menuitem", { name: "New goal" }));
	// The draft hand-off also carries where the label was, so its fly-in starts from the menu row.
	expect(add).toHaveBeenCalledWith(expect.objectContaining({ label: "New goal" }));
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();

	fireEvent.click(plus);
	fireEvent.click(screen.getByRole("menuitem", { name: "New scheduled task" }));
	expect(create).toHaveBeenCalledOnce();
	fireEvent.click(plus);
	fireEvent.click(screen.getByRole("menuitem", { name: "Create scheduled task manually" }));
	expect(createManually).toHaveBeenCalledOnce();
});

test("a phone, where the Bot draws every preset, offers no manual schedule row", () => {
	const { plus } = show({ manual: false });
	fireEvent.click(plus);
	expect(screen.queryByRole("menuitem", { name: "Create scheduled task manually" })).toBeNull();
	expect(screen.getAllByRole("menuitem")).toHaveLength(3);
});

test("the menu closes on Escape or an outside press and returns focus to the plus", () => {
	const { plus } = show();
	fireEvent.click(plus);
	fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	expect(plus).toHaveFocus();
	fireEvent.click(plus);
	fireEvent.pointerDown(document.body);
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
