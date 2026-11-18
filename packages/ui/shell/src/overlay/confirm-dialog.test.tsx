// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ShellProvider } from "../layout/shell-context.tsx";
import type { ConfirmDialogProps } from "./confirm-dialog.tsx";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { Overlay } from "./overlay.tsx";

function dialog(props: Partial<ConfirmDialogProps> = {}, withMode = true) {
	return (
		<ConfirmDialog
			open
			title="Delete Bot"
			body="Its chats are removed."
			confirmLabel="Delete"
			cancelLabel="Cancel"
			onConfirm={() => {}}
			onCancel={() => {}}
			{...(withMode ? { mode: "wide" as const } : {})}
			{...props}
		/>
	);
}

describe("ConfirmDialog", () => {
	test("is a labelled dialog with cancel on the left and the danger action on the right", () => {
		render(dialog());
		const box = screen.getByRole("dialog", { name: "Delete Bot" });
		expect(within(box).getByText("Its chats are removed.")).toBeInTheDocument();
		const footer = box.querySelector("[data-overlay-footer]");
		const buttons = within(footer as HTMLElement).getAllByRole("button");
		expect(buttons.map((button) => button.textContent)).toEqual(["Cancel", "Delete"]);
		expect(buttons[1]?.className).toContain("--color-danger");
	});

	test("confirm and cancel call their own handlers", async () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();
		render(dialog({ onConfirm, onCancel }));
		const footer = screen.getByRole("dialog").querySelector("[data-overlay-footer]") as HTMLElement;
		await userEvent.click(within(footer).getByRole("button", { name: "Delete" }));
		expect(onConfirm).toHaveBeenCalledOnce();
		await userEvent.click(within(footer).getByRole("button", { name: "Cancel" }));
		expect(onCancel).toHaveBeenCalledOnce();
	});

	test("while busy the action spins and nothing dismisses it", async () => {
		const onCancel = vi.fn();
		render(dialog({ busy: true, onCancel }));
		const box = screen.getByRole("dialog");
		const footer = box.querySelector("[data-overlay-footer]") as HTMLElement;
		expect(within(footer).getByRole("button", { name: "Delete" })).toHaveAttribute("aria-busy", "true");
		expect(within(footer).getByRole("button", { name: "Cancel" })).toBeDisabled();
		await userEvent.keyboard("{Escape}");
		expect(onCancel).not.toHaveBeenCalled();
	});

	test("shows the real failure above the buttons", () => {
		render(dialog({ error: "Server refused: default Bot" }));
		expect(screen.getByRole("alert")).toHaveTextContent("Server refused: default Bot");
	});

	test("a primary confirmation uses the primary button", () => {
		render(dialog({ tone: "primary", confirmLabel: "Transfer" }));
		expect(screen.getByRole("button", { name: "Transfer" }).className).toContain("--color-accent");
	});

	test("on a phone it is a bottom sheet, reading the mode from the shell", () => {
		render(<ShellProvider value={{ mode: "mobile", left: null, meOpen: false }}>{dialog({}, false)}</ShellProvider>);
		expect(screen.getByRole("dialog").querySelector("[data-sheet-handle]")).toBeInTheDocument();
	});
});

describe("Overlay footer and padding", () => {
	test("the footer sits outside the scrolling body, and padded gives the body 20px", () => {
		render(
			<Overlay open onClose={() => {}} title="Edit" mode="wide" padded footer={<button type="button">Save</button>}>
				<p>body</p>
			</Overlay>,
		);
		const body = screen.getByText("body").parentElement as HTMLElement;
		expect(body.className).toContain("p-[var(--spacing-5)]");
		const footer = screen.getByRole("dialog").querySelector("[data-overlay-footer]");
		expect(footer).toContainElement(screen.getByRole("button", { name: "Save" }));
		expect(body).not.toContainElement(screen.getByRole("button", { name: "Save" }));
	});

	test("existing callers keep an unpadded body and no footer", () => {
		render(
			<Overlay open onClose={() => {}} title="Edit" mode="wide">
				<p>body</p>
			</Overlay>,
		);
		expect((screen.getByText("body").parentElement as HTMLElement).className).not.toContain("p-[var(--spacing-5)]");
		expect(screen.getByRole("dialog").querySelector("[data-overlay-footer]")).toBeNull();
	});

	test("the title is semibold and the desktop close icon is 20px", () => {
		const { container } = render(
			<Overlay open onClose={() => {}} title="Edit" mode="wide">
				<p>body</p>
			</Overlay>,
		);
		expect(screen.getByRole("heading", { name: "Edit" }).className).toContain("font-semibold");
		expect(container.ownerDocument.querySelector("svg.lucide-x")).toHaveAttribute("width", "20");
	});
});
