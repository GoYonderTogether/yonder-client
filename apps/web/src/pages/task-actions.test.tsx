// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { TaskActions } from "./task-actions.tsx";

function show(scheduled: boolean) {
	const addItem = vi.fn();
	const addGoal = vi.fn();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<TaskActions scheduled={scheduled} onAddItem={addItem} onAddGoal={addGoal} />
		</I18nextProvider>,
	);
	return { addItem, addGoal, plus: screen.getByRole("button", { name: "Create" }) };
}

test("the plus is one button, not a menu: 「事项」 starts an item sentence", () => {
	const { addItem, addGoal, plus } = show(false);
	fireEvent.click(plus);
	expect(addItem).toHaveBeenCalledOnce();
	expect(addGoal).not.toHaveBeenCalled();
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("the same plus starts a goal sentence on 「目标」", () => {
	const { addItem, addGoal, plus } = show(true);
	fireEvent.click(plus);
	expect(addGoal).toHaveBeenCalledOnce();
	expect(addItem).not.toHaveBeenCalled();
});
