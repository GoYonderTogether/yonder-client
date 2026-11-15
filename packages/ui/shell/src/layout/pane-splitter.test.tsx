// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PaneSplitter } from "./pane-splitter.tsx";
import { stepPaneSpring } from "./pane-spring.ts";

beforeEach(() => {
	vi.stubGlobal("PointerEvent", MouseEvent);
	Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
	Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: vi.fn() });
	Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => true });
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const noop = () => {};

function Split({ onDrag = noop }: { onDrag?: (active: boolean) => void }) {
	const [width, resize] = useState(320);
	return (
		<PaneSplitter
			label="Resize"
			width={width}
			min={260}
			max={1000}
			onResize={resize}
			onDragChange={onDrag}
			onReset={() => resize(500)}
		/>
	);
}

test("Escape restores the pre-drag width before navigation, cancellation and unmount clean up", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: true }));
	const onDrag = vi.fn();
	const navigation = vi.fn();
	window.addEventListener("keydown", navigation);
	const { unmount } = render(<Split onDrag={onDrag} />);
	const splitter = screen.getByRole("separator");
	fireEvent.pointerDown(splitter, { button: 0, clientX: 320 });
	fireEvent.pointerMove(splitter, { clientX: 700 });
	expect(splitter).toHaveAttribute("aria-valuenow", "700");
	fireEvent.keyDown(window, { key: "Escape" });
	expect(splitter).toHaveAttribute("aria-valuenow", "320");
	expect(navigation).not.toHaveBeenCalled();
	expect(onDrag).toHaveBeenLastCalledWith(false);
	fireEvent.pointerDown(splitter, { button: 0, clientX: 320 });
	fireEvent.pointerMove(splitter, { clientX: 800 });
	fireEvent.pointerCancel(splitter);
	expect(splitter).toHaveAttribute("aria-valuenow", "320");
	fireEvent.pointerDown(splitter, { button: 0, clientX: 320 });
	unmount();
	expect(onDrag).toHaveBeenLastCalledWith(false);
	window.removeEventListener("keydown", navigation);
});

test("double click and Enter restore 50/50; keyboard reaches the full width", () => {
	render(<Split />);
	const splitter = screen.getByRole("separator");
	fireEvent.doubleClick(splitter);
	expect(splitter).toHaveAttribute("aria-valuenow", "500");
	fireEvent.keyDown(splitter, { key: "End" });
	expect(splitter).toHaveAttribute("aria-valuenow", "1000");
	fireEvent.keyDown(splitter, { key: "Enter" });
	expect(splitter).toHaveAttribute("aria-valuenow", "500");
});

test("1200/80 drag spring converges without overshoot and settles after release", () => {
	let position = 320;
	let velocity = 0;
	for (let frame = 0; frame < 120; frame++) {
		const next = stepPaneSpring(position, velocity, 900, 1 / 60);
		expect(next.position).toBeGreaterThanOrEqual(position);
		expect(next.position).toBeLessThanOrEqual(900);
		({ position, velocity } = next);
	}
	expect(position).toBeCloseTo(900);
	vi.useFakeTimers();
	let now = performance.now();
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
		window.setTimeout(() => {
			now += 16;
			callback(now);
		}, 16),
	);
	vi.stubGlobal("cancelAnimationFrame", window.clearTimeout);
	render(<Split />);
	const splitter = screen.getByRole("separator");
	fireEvent.pointerDown(splitter, { button: 0, clientX: 320 });
	fireEvent.pointerMove(splitter, { clientX: 900 });
	act(() => vi.advanceTimersByTime(48));
	expect(Number(splitter.getAttribute("aria-valuenow"))).toBeGreaterThan(320);
	fireEvent.pointerUp(splitter);
	act(() => vi.advanceTimersByTime(2000));
	expect(splitter).toHaveAttribute("aria-valuenow", "900");
	fireEvent.pointerDown(splitter, { button: 0, clientX: 900 });
	fireEvent.pointerMove(splitter, { clientX: 700 });
	act(() => vi.advanceTimersByTime(48));
	fireEvent.pointerUp(splitter);
	fireEvent.keyDown(splitter, { key: "Home" });
	act(() => vi.advanceTimersByTime(2000));
	expect(splitter).toHaveAttribute("aria-valuenow", "260");
	vi.useRealTimers();
});
