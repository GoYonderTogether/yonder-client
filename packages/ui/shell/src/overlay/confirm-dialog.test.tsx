// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog.tsx";

function renderDialog(props: Partial<ConfirmDialogProps> = {}) {
	const onConfirm = vi.fn();
	const onCancel = vi.fn();
	render(
		<ConfirmDialog
			open
			title="Delete “Weekly”?"
			body="This cannot be undone."
			confirmLabel="Delete"
			cancelLabel="Cancel"
			closeLabel="Close"
			onConfirm={onConfirm}
			onCancel={onCancel}
			{...props}
		/>,
	);
	return { onConfirm, onCancel };
}

test("asks the question, states the consequence and offers two equal choices", () => {
	renderDialog();
	const dialog = screen.getByRole("dialog", { name: "Delete “Weekly”?" });
	expect(dialog).toHaveTextContent("This cannot be undone.");
	// No header bar and no X: Cancel, Esc and the scrim are the exits.
	expect(dialog.querySelector("[data-frame-header]")).toBeNull();
	expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
});

test("confirm and cancel call their own handlers; Esc cancels", () => {
	const { onConfirm, onCancel } = renderDialog();
	fireEvent.click(screen.getByRole("button", { name: "Delete" }));
	expect(onConfirm).toHaveBeenCalledOnce();
	expect(onCancel).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	fireEvent.keyDown(window, { key: "Escape" });
	expect(onCancel).toHaveBeenCalledTimes(2);
});

test("the danger tone commits with the solid destructive button, the primary tone with the accent", () => {
	const { unmount } = render(
		<ConfirmDialog
			open
			title="T"
			body="B"
			confirmLabel="Do it"
			cancelLabel="Cancel"
			closeLabel="Close"
			onConfirm={() => {}}
			onCancel={() => {}}
		/>,
	);
	expect(screen.getByRole("button", { name: "Do it" }).className).toContain("bg-[var(--color-danger)]");
	unmount();
	renderDialog({ tone: "primary", confirmLabel: "Restart" });
	expect(screen.getByRole("button", { name: "Restart" }).className).toContain("bg-[var(--color-accent)]");
});

test("while busy Cancel is disabled and the confirm button shows progress", () => {
	renderDialog({ busy: true });
	expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
	expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute("aria-busy", "true");
});

test("a failure is announced above the buttons with its real reason", () => {
	renderDialog({ error: "Server said no" });
	expect(screen.getByRole("alert")).toHaveTextContent("Server said no");
});
