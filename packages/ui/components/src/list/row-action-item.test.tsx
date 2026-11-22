// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ConversationRow, ListRow, type RowAction } from "@yonder/ui-components";
import { expect, test, vi } from "vitest";

test("reveals the same icon actions on hold and left swipe without opening the row", () => {
	const onOpen = vi.fn();
	const onDelete = vi.fn();
	const actions: RowAction[] = [{ label: "Delete", icon: <svg />, onSelect: onDelete, tone: "danger" }];
	vi.useFakeTimers();
	try {
		render(
			<ul>
				<ConversationRow title="Group" leading={null} onClick={onOpen} actions={actions} />
				<ListRow title="Task" onClick={onOpen} actions={actions} />
			</ul>,
		);
		const group = screen.getByRole("button", { name: "Group" });
		const task = screen.getByRole("button", { name: "Task" });
		const point = { pointerType: "touch", pointerId: 1, isPrimary: true, button: 0, clientX: 200, clientY: 100 };

		fireEvent.pointerDown(group, point);
		act(() => vi.advanceTimersByTime(500));
		fireEvent.pointerUp(group, point);
		fireEvent.click(group, { detail: 1 });
		expect(group).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
		expect(onOpen).not.toHaveBeenCalled();
		expect(onDelete).not.toHaveBeenCalled();

		fireEvent.pointerDown(task, point);
		fireEvent.pointerMove(task, { ...point, clientY: 140 });
		fireEvent.pointerCancel(task, { ...point, clientY: 140 });
		act(() => vi.advanceTimersByTime(500));
		expect(group).toHaveAttribute("aria-expanded", "false");
		expect(task).toHaveAttribute("aria-expanded", "false");

		fireEvent.pointerDown(task, point);
		fireEvent.pointerMove(task, { ...point, clientX: 130 });
		fireEvent.pointerUp(task, { ...point, clientX: 130 });
		const remove = screen.getByRole("button", { name: "Delete" });
		fireEvent.click(remove, { detail: 1 });
		expect(task).toHaveAttribute("aria-expanded", "true");
		expect(onOpen).not.toHaveBeenCalled();
		expect(onDelete).not.toHaveBeenCalled();

		fireEvent.pointerDown(remove, point);
		fireEvent.click(remove, { detail: 1 });
		expect(onDelete).toHaveBeenCalledOnce();
		expect(task).toHaveAttribute("aria-expanded", "false");
		fireEvent.pointerDown(task, point);
		fireEvent.pointerUp(task, point);
		fireEvent.click(task, { detail: 1 });
		expect(onOpen).toHaveBeenCalledOnce();

		fireEvent.keyDown(task, { key: "F10", shiftKey: true });
		fireEvent.keyDown(remove, { key: "Escape" });
		expect(task).toHaveFocus();
		expect(task).toHaveAttribute("aria-expanded", "false");
	} finally {
		vi.useRealTimers();
	}
});
