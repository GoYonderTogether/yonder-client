// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { TaskActions } from "./task-actions.tsx";

function show() {
	const add = vi.fn();
	const addGoal = vi.fn();
	const create = vi.fn();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<TaskActions onAdd={add} onAddGoal={addGoal} onCreateSchedule={create} />
		</I18nextProvider>,
	);
	return { add, addGoal, create, plus: screen.getByRole("button", { name: "Create" }) };
}

test("the plus is one menu with an item, a goal and a scheduled task, whichever tab is open", () => {
	const { add, addGoal, create, plus } = show();
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	fireEvent.click(plus);
	expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
		"New item",
		"New goal",
		"New scheduled task",
	]);
	fireEvent.click(screen.getByRole("menuitem", { name: "New item" }));
	expect(add).toHaveBeenCalledOnce();
	fireEvent.click(plus);
	fireEvent.click(screen.getByRole("menuitem", { name: "New goal" }));
	expect(addGoal).toHaveBeenCalledOnce();
	fireEvent.click(plus);
	fireEvent.click(screen.getByRole("menuitem", { name: "New scheduled task" }));
	expect(create).toHaveBeenCalledOnce();
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
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
