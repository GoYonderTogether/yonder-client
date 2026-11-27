// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ConversationRow, ListRow, type RowAction } from "@yonder/ui-components";
import { expect, test, vi } from "vitest";

test("opens conversation actions at the press without sliding and preserves the generic action strip", () => {
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
		const restingTransform = group.parentElement?.style.transform;
		const task = screen.getByRole("button", { name: "Task" });
		const point = { pointerType: "touch", pointerId: 1, isPrimary: true, button: 0, clientX: 200, clientY: 100 };
		const taskStrip = document.getElementById(task.getAttribute("aria-controls") ?? "");
		if (!taskStrip) throw new Error("Expected task action strip");
		vi.spyOn(taskStrip, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 120, 60));

		fireEvent.contextMenu(group, { clientX: 140, clientY: 80 });
		expect(screen.getByRole("menu", { name: "Group" })).toHaveStyle({ left: "140px", top: "80px" });
		const deleteMenuItem = screen.getByRole("menuitem", { name: "Delete" });
		expect(deleteMenuItem).toHaveFocus();
		fireEvent.keyDown(deleteMenuItem, { key: "Escape" });
		expect(group).toHaveFocus();
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();

		fireEvent.pointerDown(group, point);
		act(() => vi.advanceTimersByTime(500));
		fireEvent.pointerMove(group, { ...point, clientX: 130 });
		fireEvent.pointerUp(group, { ...point, clientX: 130 });
		expect(fireEvent.mouseDown(group, { detail: 1 })).toBe(false);
		fireEvent.click(group, { detail: 1 });
		expect(group).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByRole("menu", { name: "Group" })).toHaveStyle({ left: "200px", top: "100px" });
		expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
		expect(group.parentElement?.style.transform).toBe(restingTransform);
		expect(onOpen).not.toHaveBeenCalled();
		expect(onDelete).not.toHaveBeenCalled();

		fireEvent.pointerDown(task, point);
		fireEvent.pointerMove(task, { ...point, clientY: 140 });
		fireEvent.pointerCancel(task, { ...point, clientY: 140 });
		act(() => vi.advanceTimersByTime(500));
		expect(group).toHaveAttribute("aria-expanded", "false");
		expect(task).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();

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

test("a held pointer reverses immediately after reaching either edge", () => {
	const select = vi.fn();
	vi.useFakeTimers();
	try {
		render(
			<ul>
				<ListRow title="Held task" actions={[{ label: "Rename", icon: <svg />, onSelect: select }]} />
			</ul>,
		);
		const task = screen.getByRole("button", { name: "Held task" });
		const card = task.parentElement;
		const row = card?.parentElement;
		const strip = document.getElementById(task.getAttribute("aria-controls") ?? "");
		if (!card || !row || !strip) throw new Error("Expected the card and its action strip");
		vi.spyOn(strip, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 120, 60));
		vi.spyOn(row, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 60));
		const paintedCard = vi.spyOn(card, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 60));
		const point = { pointerType: "touch", pointerId: 1, isPrimary: true, button: 0, clientX: 200, clientY: 100 };

		fireEvent.pointerDown(task, point);
		act(() => vi.advanceTimersByTime(500));
		// The first post-hold movement interrupts the opening animation 80px into its travel.
		paintedCard.mockReturnValue(new DOMRect(-80, 0, 200, 60));
		fireEvent.pointerMove(task, { ...point, clientX: 210 });
		expect(card.style.transform).toContain("70px");
		fireEvent.pointerMove(task, { ...point, clientX: 130 });
		fireEvent.pointerMove(task, { ...point, clientX: 70 });
		expect(card.style.transform).toContain("120px");
		fireEvent.pointerMove(task, { ...point, clientX: 76 });
		expect(card.style.transform).toContain("114px");
		fireEvent.pointerMove(task, { ...point, clientX: 220 });
		fireEvent.pointerMove(task, { ...point, clientX: 214 });
		expect(card.style.transform).toContain("6px");
		fireEvent.pointerUp(task, { ...point, clientX: 214 });
		expect(task).toHaveAttribute("aria-expanded", "false");

		fireEvent.keyDown(task, { key: "ArrowLeft" });
		paintedCard.mockReturnValue(new DOMRect(-120, 0, 200, 60));
		fireEvent.pointerDown(task, point);
		fireEvent.pointerMove(task, { ...point, clientX: 260 });
		const action = strip.querySelector("button");
		if (!action) throw new Error("Expected a revealed action");
		fireEvent.pointerUp(action, { ...point, clientX: 260 });
		fireEvent.lostPointerCapture(task, point);
		expect(task).toHaveAttribute("aria-expanded", "false");
		expect(select).not.toHaveBeenCalled();
	} finally {
		vi.useRealTimers();
	}
});
