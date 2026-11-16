// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";

vi.mock("@tarojs/taro", () => ({
	default: {
		getWindowInfo: () => ({
			windowHeight: 844,
			windowWidth: 390,
			screenHeight: 844,
			statusBarHeight: 0,
			safeArea: { bottom: 0 },
		}),
	},
}));

import { useChatViewport } from "./use-viewport";

let state: ReturnType<typeof useChatViewport>;
function Probe() {
	state = useChatViewport();
	return null;
}
test("H5 tracks the visible bottom on keyboard resize and viewport scroll", async () => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	vi.stubEnv("TARO_ENV", "h5");
	const visual = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
	Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
	Object.defineProperty(window, "visualViewport", { configurable: true, value: visual });
	document.documentElement.style.setProperty("--titlebar-height", "52px");
	const host = document.createElement("div");
	const root = createRoot(host);
	await act(async () => root.render(createElement(Probe)));
	expect(state.contentHeight).toBe(792);
	visual.height = 544;
	visual.offsetTop = 40;
	await act(async () => visual.dispatchEvent(new Event("resize")));
	expect(state.contentHeight).toBe(532);
	expect(state.keyboardVisible).toBe(true);
	visual.offsetTop = 60;
	await act(async () => visual.dispatchEvent(new Event("scroll")));
	expect(state.contentHeight).toBe(552);
	await act(async () => root.unmount());
	vi.unstubAllEnvs();
});

test("H5 handles a keyboard that shrinks the layout viewport and pans the document", async () => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	vi.stubEnv("TARO_ENV", "h5");
	const visual = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
	Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
	Object.defineProperty(window, "visualViewport", { configurable: true, value: visual });
	const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
	const host = document.createElement("div");
	const root = createRoot(host);
	await act(async () => root.render(createElement(Probe)));
	act(() => state.onFocus());
	Object.defineProperty(window, "innerHeight", { configurable: true, value: 447 });
	Object.defineProperty(window, "scrollY", { configurable: true, value: 397 });
	visual.height = 447;
	visual.offsetTop = 397;
	await act(async () => window.dispatchEvent(new Event("scroll")));
	expect(state.keyboardVisible).toBe(true);
	expect(scrollTo).toHaveBeenCalledWith(0, 0);
	expect(state.contentHeight).toBe(395);
	visual.scale = 1.2;
	scrollTo.mockClear();
	await act(async () => window.dispatchEvent(new Event("scroll")));
	expect(scrollTo).not.toHaveBeenCalled();
	await act(async () => root.unmount());
	scrollTo.mockRestore();
	vi.unstubAllEnvs();
});
