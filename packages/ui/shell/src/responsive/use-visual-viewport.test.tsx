// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { useVisualViewport } from "./use-visual-viewport.ts";

afterEach(() => vi.unstubAllGlobals());

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
	expect(frame.style.getPropertyValue("--dock-bottom-inset")).toBe("env(safe-area-inset-bottom)");

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
