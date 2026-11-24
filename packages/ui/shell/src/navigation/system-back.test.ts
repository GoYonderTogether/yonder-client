// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { backAction, leaveApp, listenForSystemBack } from "./system-back.ts";
import { dismissTopLayer, topLayer, useDismiss } from "./use-dismiss.ts";

const { onBackButtonPress, unregister, exit } = vi.hoisted(() => ({
	onBackButtonPress: vi.fn(),
	unregister: vi.fn(async () => undefined),
	exit: vi.fn(async () => undefined),
}));
vi.mock("@tauri-apps/api/app", () => ({ onBackButtonPress, exit }));

afterEach(() => {
	onBackButtonPress.mockReset();
	exit.mockReset();
	vi.unstubAllGlobals();
});

const android = "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36";

test("Back closes the topmost layer before it touches history", () => {
	expect(backAction(true, true)).toBe("layer");
	expect(backAction(true, false)).toBe("layer");
});

test("with no layer open Back follows history, and only leaves the app when nothing is behind", () => {
	expect(backAction(false, true)).toBe("history");
	expect(backAction(false, false)).toBe("exit");
});

test("the registry hands Back the same topmost layer Escape closes", () => {
	const layers = [{ priority: 10 }, { priority: 30 }, { priority: 20 }];
	expect(topLayer(layers)).toBe(layers[1]);
});

test("no listener is registered in a browser tab or outside the Android shell", async () => {
	vi.stubGlobal("navigator", { userAgent: android });
	expect(await listenForSystemBack(() => {})).toBeNull();
	vi.stubGlobal("__TAURI_INTERNALS__", {});
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)" });
	expect(await listenForSystemBack(() => {})).toBeNull();
	expect(onBackButtonPress).not.toHaveBeenCalled();
});

test("an Android shell forwards every Back press with its history flag", async () => {
	vi.stubGlobal("__TAURI_INTERNALS__", {});
	vi.stubGlobal("navigator", { userAgent: android });
	const handlers: ((payload: { canGoBack: boolean }) => void)[] = [];
	onBackButtonPress.mockImplementation(async (handler) => {
		handlers.push(handler);
		return { unregister };
	});
	const seen: boolean[] = [];
	const listener = await listenForSystemBack((canGoBack) => seen.push(canGoBack));
	expect(listener).not.toBeNull();
	handlers[0]?.({ canGoBack: true });
	handlers[0]?.({ canGoBack: false });
	expect(seen).toEqual([true, false]);
	await listener?.unregister();
	expect(unregister).toHaveBeenCalledOnce();
});

test("a host without the app plugin leaves the webview's own Back in place", async () => {
	vi.stubGlobal("__TAURI_INTERNALS__", {});
	vi.stubGlobal("navigator", { userAgent: android });
	onBackButtonPress.mockRejectedValueOnce(new Error("command not found"));
	expect(await listenForSystemBack(() => {})).toBeNull();
});

test("leaving the app asks the activity to finish, and does nothing when it cannot", async () => {
	await leaveApp();
	expect(exit).toHaveBeenCalledWith(0);
	exit.mockRejectedValueOnce(new Error("command not found"));
	await expect(leaveApp()).resolves.toBeUndefined();
});

test("a key press with nothing open closes nothing", () => {
	expect(dismissTopLayer()).toBe(false);
});

test("unmounting removes a layer from the registry", async () => {
	const { renderHook } = await import("@testing-library/react");
	const calls: string[] = [];
	const low = renderHook(() => useDismiss(true, () => calls.push("low"), 1));
	const high = renderHook(() => useDismiss(true, () => calls.push("high"), 9));
	expect(dismissTopLayer()).toBe(true);
	expect(calls).toEqual(["high"]);
	high.unmount();
	expect(dismissTopLayer()).toBe(true);
	expect(calls).toEqual(["high", "low"]);
	low.unmount();
	expect(dismissTopLayer()).toBe(false);
});
