// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";

const mock = vi.hoisted(() => ({
	height: 844,
	width: 390,
	keyboard: undefined as undefined | ((event: { height: number }) => void),
	resize: undefined as undefined | (() => void),
	offKeyboard: vi.fn(),
	offResize: vi.fn(),
}));
vi.mock("@tarojs/taro", () => ({
	default: {
		getWindowInfo: () => ({
			windowHeight: mock.height,
			windowWidth: mock.width,
			screenHeight: 844,
			statusBarHeight: 44,
			safeArea: { bottom: 810 },
		}),
		getMenuButtonBoundingClientRect: () => ({ top: 50, left: 300, height: 32 }),
		onKeyboardHeightChange: (fn: typeof mock.keyboard) => {
			mock.keyboard = fn;
		},
		offKeyboardHeightChange: mock.offKeyboard,
		onWindowResize: (fn: typeof mock.resize) => {
			mock.resize = fn;
		},
		offWindowResize: mock.offResize,
	},
}));

import { useChatViewport } from "./use-viewport";

let state: ReturnType<typeof useChatViewport>;
function Probe() {
	state = useChatViewport();
	return null;
}

test("keyboard overlay is not counted twice and listeners are removed", async () => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	mock.height = 844;
	const host = document.createElement("div");
	const root = createRoot(host);
	await act(async () => root.render(createElement(Probe)));
	const closed = state.contentHeight;
	await act(async () => state.onFocus());
	await act(async () => mock.keyboard?.({ height: 300 }));
	const open = state.contentHeight;
	expect(open).toBe(closed + 34 - 300);
	mock.height = 544;
	await act(async () => mock.resize?.());
	expect(state.contentHeight).toBe(open);
	mock.height = 844;
	await act(async () => mock.keyboard?.({ height: 0 }));
	expect(state.contentHeight).toBe(closed);
	await act(async () => state.onBlur());
	await act(async () => state.onFocus());
	mock.height = 544;
	await act(async () => mock.resize?.());
	await act(async () => mock.keyboard?.({ height: 300 }));
	expect(state.contentHeight).toBe(open);
	mock.height = 844;
	await act(async () => mock.keyboard?.({ height: 0 }));
	mock.width = 844;
	mock.height = 390;
	await act(async () => mock.resize?.());
	await act(async () => mock.keyboard?.({ height: 200 }));
	expect(state.contentHeight).toBe(390 - 88 - 200);
	await act(async () => root.unmount());
	expect(mock.offKeyboard).toHaveBeenCalledWith(mock.keyboard);
	expect(mock.offResize).toHaveBeenCalledWith(mock.resize);
});
