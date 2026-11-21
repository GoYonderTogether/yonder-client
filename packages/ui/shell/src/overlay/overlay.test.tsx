// @vitest-environment jsdom
/**
 * The overlay is layer three, so its test lives here: it is a modal on a wide viewport, a sheet on
 * a narrow one, and every exit (Esc, the close button, a click outside) goes through one callback.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useDismiss } from "../navigation/use-dismiss.ts";
import { Overlay } from "./overlay.tsx";

const motionPreference = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", async (original) => ({
	...(await original<typeof import("motion/react")>()),
	useReducedMotion: () => motionPreference.reduced,
}));
beforeEach(() => {
	motionPreference.reduced = false;
});

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
		render(
			<Overlay open onClose={onClose} title="Me" mode="wide">
				<p>content</p>
			</Overlay>,
		);
		const backdrop = document.body.querySelector('button[aria-label="close"]') as HTMLElement;
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

function DismissibleOverlay({ mode }: { mode: "wide" | "medium" | "compact" | "mobile" }) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button type="button" onClick={() => setOpen(true)}>
				Open
			</button>
			<Overlay open={open} onClose={() => setOpen(false)} title="Dismiss test" mode={mode}>
				<p>Dialog content</p>
			</Overlay>
		</>
	);
}

test.each(
	(["wide", "medium", "compact", "mobile"] as const).flatMap((mode) =>
		[false, true].map((reduced) => ({ mode, reduced })),
	),
)(
	"$mode controlled overlay closes and reopens through every exit (reduced motion: $reduced)",
	async ({ mode, reduced }) => {
		motionPreference.reduced = reduced;
		render(<DismissibleOverlay mode={mode} />);
		for (const exit of ["close", "backdrop", "Escape"]) {
			for (let attempt = 0; attempt < 2; attempt++) {
				fireEvent.click(screen.getByRole("button", { name: "Open" }));
				expect(screen.getByRole("dialog", { name: "Dismiss test" })).toBeInTheDocument();
				if (exit === "Escape") fireEvent.keyDown(window, { key: "Escape" });
				else fireEvent.click(screen.getAllByRole("button", { name: "close" })[exit === "close" ? 1 : 0] as HTMLElement);
				await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeInTheDocument());
			}
		}
	},
);

test("the scrim leaves the instant the overlay is asked to close, before the panel has finished leaving", async () => {
	render(<DismissibleOverlay mode="mobile" />);
	fireEvent.click(screen.getByRole("button", { name: "Open" }));
	expect(document.querySelector("[data-overlay-backdrop]")).toBeInTheDocument();
	fireEvent.keyDown(window, { key: "Escape" });
	expect(document.querySelector("[data-overlay-backdrop]")).not.toBeInTheDocument();
	await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeInTheDocument());
});
