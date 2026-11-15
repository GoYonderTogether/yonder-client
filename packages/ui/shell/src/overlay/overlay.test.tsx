// @vitest-environment jsdom
/**
 * The overlay is layer three, so its test lives here: it is a modal on a wide viewport, a sheet on
 * a narrow one, and every exit (Esc, the close button, a click outside) goes through one callback.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useDismiss } from "../navigation/use-dismiss.ts";
import { Overlay } from "./overlay.tsx";

function DetailWithOverlay({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
	useDismiss(true, onBack);
	return (
		<Overlay open onClose={onClose} title="Confirm" mode="mobile">
			<p>content</p>
		</Overlay>
	);
}

describe("Overlay", () => {
	test("renders nothing when closed", () => {
		const { container } = render(
			<Overlay open={false} onClose={() => {}} title="Me" mode="wide">
				<p>content</p>
			</Overlay>,
		);
		expect(container).toBeEmptyDOMElement();
	});

	test("is a labelled modal dialog when open", () => {
		render(
			<Overlay open onClose={() => {}} title="Me" mode="wide">
				<p>content</p>
			</Overlay>,
		);
		const dialog = screen.getByRole("dialog", { name: "Me" });
		expect(dialog).toHaveAttribute("aria-modal", "true");
	});

	test("Escape closes it, the same exit as the back button", () => {
		const onClose = vi.fn();
		render(
			<Overlay open onClose={onClose} title="Me" mode="mobile">
				<p>content</p>
			</Overlay>,
		);
		act(() => {
			fireEvent.keyDown(window, { key: "Escape" });
		});
		expect(onClose).toHaveBeenCalled();
	});

	test("Escape closes the overlay before the underlying detail", () => {
		const onBack = vi.fn();
		const onClose = vi.fn();
		render(<DetailWithOverlay onBack={onBack} onClose={onClose} />);
		fireEvent.keyDown(window, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onBack).not.toHaveBeenCalled();
	});

	test("the close button closes it", () => {
		const onClose = vi.fn();
		render(
			<Overlay open onClose={onClose} title="Me" mode="wide">
				<p>content</p>
			</Overlay>,
		);
		// The panel's own close control is the last one; the first is the backdrop.
		const buttons = screen.getAllByRole("button", { name: "close" });
		fireEvent.click(buttons[buttons.length - 1] as HTMLElement);
		expect(onClose).toHaveBeenCalled();
	});

	test("a click on the backdrop closes it", () => {
		const onClose = vi.fn();
		const { container } = render(
			<Overlay open onClose={onClose} title="Me" mode="wide">
				<p>content</p>
			</Overlay>,
		);
		const backdrop = container.querySelector('button[aria-label="close"]') as HTMLElement;
		fireEvent.click(backdrop);
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});

test("keyboard focus wraps within the modal", () => {
	render(
		<Overlay open onClose={() => {}} title="Create" mode="wide">
			<input aria-label="Name" />
			<button type="button">Create</button>
		</Overlay>,
	);
	const first = screen.getAllByRole("button", { name: "close" })[1] as HTMLElement;
	const last = screen.getByRole("button", { name: "Create" });
	last.focus();
	fireEvent.keyDown(last, { key: "Tab" });
	expect(first).toHaveFocus();
	fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
	expect(last).toHaveFocus();
});

test("mobile contact navigation exposes a back control without changing desktop close", () => {
	const onClose = vi.fn();
	const view = render(
		<Overlay open onClose={onClose} title="Add contacts" mode="mobile" mobileBackLabel="Back">
			<p>content</p>
		</Overlay>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Back" }));
	expect(onClose).toHaveBeenCalledOnce();
	view.rerender(
		<Overlay open onClose={onClose} title="Add contacts" mode="wide" mobileBackLabel="Back">
			<p>content</p>
		</Overlay>,
	);
	expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
});

test("a bottom sheet keeps body scrolling and uses its handle for dismissal", () => {
	const onClose = vi.fn();
	render(
		<Overlay open onClose={onClose} title="Connect" mode="mobile" mobilePresentation="sheet">
			<div data-testid="body">Long content</div>
		</Overlay>,
	);
	const dialog = screen.getByRole("dialog", { name: "Connect" });
	vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({ top: 0, left: 0, width: 390, height: 400 } as DOMRect);
	Object.assign(dialog, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: () => true });
	const pointer = (target: HTMLElement, type: string, y: number) => {
		const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 20, clientY: y });
		Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
		fireEvent(target, event);
	};
	expect(dialog).toHaveAttribute("data-page-side", "bottom");
	expect(dialog).toHaveStyle({ touchAction: "auto" });
	const body = screen.getByTestId("body");
	pointer(body, "pointerdown", 100);
	pointer(body, "pointermove", 300);
	pointer(body, "pointerup", 300);
	expect(onClose).not.toHaveBeenCalled();
	const handle = dialog.querySelector("[data-sheet-handle]") as HTMLElement;
	expect(handle).toHaveClass("touch-none");
	pointer(handle, "pointerdown", 10);
	pointer(handle, "pointermove", 30);
	pointer(handle, "pointermove", 230);
	pointer(handle, "pointerup", 230);
	expect(onClose).toHaveBeenCalledOnce();
});
