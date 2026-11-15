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
