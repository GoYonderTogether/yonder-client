// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { useVisualViewport } from "./use-visual-viewport.ts";

afterEach(() => {
	vi.unstubAllGlobals();
	delete document.documentElement.dataset.nativeMobile;
});

function Reporter({ receive }: { receive: (keyboard: boolean) => void }) {
	const ref = useRef<HTMLDivElement>(null);
	receive(useVisualViewport(ref, true));
	return <div ref={ref} data-testid="reporter" />;
}

function Frame() {
	const ref = useRef<HTMLDivElement>(null);
	useVisualViewport(ref, true);
	return <div ref={ref} data-testid="frame" />;
}

test("tracks viewport resize and scroll, then removes listeners and variables", () => {
	const viewport = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0 });
	const remove = vi.spyOn(viewport, "removeEventListener");
	vi.stubGlobal("visualViewport", viewport);

	const { unmount } = render(<Frame />);
	const frame = screen.getByTestId("frame");
	expect(frame.style.getPropertyValue("--app-height")).toBe(`${window.innerHeight}px`);
	expect(frame.style.getPropertyValue("--dock-bottom-inset")).toBe(
		"var(--safe-area-bottom, env(safe-area-inset-bottom))",
	);

	viewport.height = 420;
	act(() => viewport.dispatchEvent(new Event("resize")));
	expect(frame.style.getPropertyValue("--app-height")).toBe("420px");
	expect(frame.style.getPropertyValue("--dock-bottom-inset")).toBe("0px");

	viewport.offsetTop = 40;
	act(() => viewport.dispatchEvent(new Event("scroll")));
	expect(frame.style.getPropertyValue("--app-offset-top")).toBe("40px");

	unmount();
	expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
	expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
	expect(frame.style.getPropertyValue("--app-height")).toBe("");
	expect(frame.style.getPropertyValue("--app-offset-top")).toBe("");
	expect(frame.style.getPropertyValue("--dock-bottom-inset")).toBe("");
});

test.each([true, false])(
	"an equal-height shifted viewport removes bottom clearance only in the native host (%s)",
	(native) => {
		if (native) document.documentElement.dataset.nativeMobile = "true";
		vi.stubGlobal("innerHeight", 477);
		const viewport = Object.assign(new EventTarget(), { height: 477, offsetTop: 397 });
		vi.stubGlobal("visualViewport", viewport);
		render(<Frame />);
		const frame = screen.getByTestId("frame");
		const safeBottom = "var(--safe-area-bottom, env(safe-area-inset-bottom))";
		expect(frame.style.getPropertyValue("--dock-bottom-inset")).toBe(native ? "0px" : safeBottom);
		viewport.offsetTop = 0;
		act(() => viewport.dispatchEvent(new Event("resize")));
		expect(frame.style.getPropertyValue("--dock-bottom-inset")).toBe(safeBottom);
	},
);

test("the iOS host's keyboard announcement moves the frame at once and reports the keyboard", () => {
	document.documentElement.dataset.nativeMobile = "true";
	vi.stubGlobal("innerHeight", 800);
	const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
	vi.stubGlobal("visualViewport", viewport);
	let keyboard = false;
	render(
		<Reporter
			receive={(value) => {
				keyboard = value;
			}}
		/>,
	);
	const frame = screen.getByTestId("reporter");
	act(() => {
		window.dispatchEvent(new CustomEvent("yonder-keyboard", { detail: { height: 336, duration: 250 } }));
	});
	expect(keyboard).toBe(true);
	expect(frame.style.getPropertyValue("--app-height")).toBe("464px");
	expect(frame.style.getPropertyValue("--keyboard-duration")).toBe("250ms");
	expect(frame.style.getPropertyValue("--dock-bottom-inset")).toBe("0px");
	// The late visual-viewport report no longer drives the frame once the host has spoken.
	viewport.height = 470;
	act(() => viewport.dispatchEvent(new Event("resize")));
	expect(frame.style.getPropertyValue("--app-height")).toBe("464px");
	act(() => {
		window.dispatchEvent(new CustomEvent("yonder-keyboard", { detail: { height: 0, duration: 250 } }));
	});
	expect(keyboard).toBe(false);
	expect(frame.style.getPropertyValue("--app-height")).toBe("800px");
});
