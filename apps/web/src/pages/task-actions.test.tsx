// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { TaskActions } from "./task-actions.tsx";

test("item plus keeps the direct draft action", () => {
	const add = vi.fn();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<TaskActions scheduled={false} onAdd={add} onCreateSchedule={() => {}} />
		</I18nextProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "New item" }));
	expect(add).toHaveBeenCalledOnce();
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("goal plus preserves both create paths, and closes on Escape or outside click", () => {
	const add = vi.fn();
	const create = vi.fn();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<TaskActions scheduled onAdd={add} onCreateSchedule={create} />
		</I18nextProvider>,
	);
	const plus = screen.getByRole("button", { name: "New goal" });
	fireEvent.click(plus);
	fireEvent.click(screen.getByRole("menuitem", { name: "New scheduled task" }));
	expect(create).toHaveBeenCalledOnce();
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	fireEvent.click(plus);
	fireEvent.click(screen.getByRole("menuitem", { name: "New goal" }));
	expect(add).toHaveBeenCalledOnce();
	fireEvent.click(plus);
	fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	expect(plus).toHaveFocus();
	fireEvent.click(plus);
	fireEvent.pointerDown(document.body);
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
