// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useChromeSize } from "./use-chrome-size.ts";

afterEach(() => {
	delete document.documentElement.dataset.nativeMobile;
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function Frame() {
	const ref = useChromeSize("--native-dock-height");
	return (
		<div data-testid="frame">
			<div ref={ref}>Composer</div>
		</div>
	);
}

test("native scroll clearance follows composer height and releases it on unmount", () => {
	document.documentElement.dataset.nativeMobile = "true";
	let resize = () => {};
	const disconnect = vi.fn();
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(update: () => void) {
				resize = update;
			}
			observe() {}
			disconnect = disconnect;
		},
	);
	const height = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 96 } as DOMRect);
	const { unmount } = render(<Frame />);
	const frame = screen.getByTestId("frame");
	expect(frame.style.getPropertyValue("--native-dock-height")).toBe("96px");
	height.mockReturnValue({ height: 144 } as DOMRect);
	act(() => resize());
	expect(frame.style.getPropertyValue("--native-dock-height")).toBe("144px");
	unmount();
	expect(disconnect).toHaveBeenCalled();
	expect(frame.style.getPropertyValue("--native-dock-height")).toBe("");
});

test("browser geometry is left to the existing flex layout", () => {
	const observer = vi.fn();
	vi.stubGlobal("ResizeObserver", observer);
	render(<Frame />);
	expect(observer).not.toHaveBeenCalled();
	expect(screen.getByTestId("frame").style.getPropertyValue("--native-dock-height")).toBe("");
});
