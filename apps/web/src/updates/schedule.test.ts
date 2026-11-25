import { describe, expect, test, vi } from "vitest";
import { scheduleUpdateChecks } from "./schedule.ts";

function harness(overrides: { visible?: boolean } = {}) {
	let clock = 1_000_000;
	let onVisibility: (() => void) | undefined;
	let onFocus: (() => void) | undefined;
	const visibility = {
		visibilityState: overrides.visible === false ? "hidden" : "visible",
		addEventListener: vi.fn((_: string, handler: () => void) => {
			onVisibility = handler;
		}),
		removeEventListener: vi.fn(),
	};
	const focus = {
		addEventListener: vi.fn((_: string, handler: () => void) => {
			onFocus = handler;
		}),
		removeEventListener: vi.fn(),
	};
	const check = vi.fn(async () => {});
	const schedule = scheduleUpdateChecks(check, {
		visibility: visibility as unknown as Document,
		focus: focus as unknown as Window,
		now: () => clock,
	});
	return {
		check,
		schedule,
		visibility,
		focus,
		advance(ms: number) {
			clock += ms;
		},
		/** Simulate the app becoming visible and the window receiving focus. */
		resume() {
			visibility.visibilityState = "visible";
			onVisibility?.();
			onFocus?.();
		},
		hide() {
			visibility.visibilityState = "hidden";
			onVisibility?.();
		},
	};
}

describe("update checks", () => {
	test("checks after launch without blocking the first screen", async () => {
		vi.useFakeTimers();
		const h = harness();
		expect(h.check).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(4_999);
		expect(h.check).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(h.check).toHaveBeenCalledOnce();
		h.schedule.stop();
		vi.useRealTimers();
	});

	test("returning to the app checks once, not once per signal", async () => {
		vi.useFakeTimers();
		const h = harness();
		await vi.advanceTimersByTimeAsync(5_000);
		expect(h.check).toHaveBeenCalledOnce();
		h.advance(31 * 60 * 1000);
		h.resume();
		expect(h.check).toHaveBeenCalledTimes(2);
		// focus and visibilitychange both fired, and neither repeats within the throttle.
		h.hide();
		h.resume();
		expect(h.check).toHaveBeenCalledTimes(2);
		h.schedule.stop();
		vi.useRealTimers();
	});

	test("a return inside the throttle window does not check", async () => {
		vi.useFakeTimers();
		const h = harness();
		await vi.advanceTimersByTimeAsync(5_000);
		h.advance(5 * 60 * 1000);
		h.resume();
		expect(h.check).toHaveBeenCalledOnce();
		h.schedule.stop();
		vi.useRealTimers();
	});

	test("a long-running app still checks on its interval and stops cleanly", async () => {
		vi.useFakeTimers();
		const h = harness();
		await vi.advanceTimersByTimeAsync(5_000);
		expect(h.check).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
		expect(h.check).toHaveBeenCalledTimes(2);
		h.schedule.stop();
		await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
		expect(h.check).toHaveBeenCalledTimes(2);
		expect(h.visibility.removeEventListener).toHaveBeenCalled();
		expect(h.focus.removeEventListener).toHaveBeenCalled();
		vi.useRealTimers();
	});

	test("a failed check is swallowed here; the updater already reports its own error", async () => {
		vi.useFakeTimers();
		const check = vi.fn(async () => {
			throw new Error("offline");
		});
		const schedule = scheduleUpdateChecks(check, { visibility: null, focus: null });
		await vi.advanceTimersByTimeAsync(5_000);
		expect(check).toHaveBeenCalledOnce();
		schedule.stop();
		vi.useRealTimers();
	});
});
