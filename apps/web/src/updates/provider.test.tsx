// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { updateDriver, updatePlatform } from "./drivers.ts";
import { UpdateProvider, useUpdater } from "./provider.tsx";

vi.mock("./drivers.ts", () => ({ updatePlatform: vi.fn(), updateDriver: vi.fn() }));
afterEach(() => {
	vi.useRealTimers();
	vi.resetAllMocks();
});

function Manual({ capture }: { capture: (check: (() => Promise<void>) | undefined) => void }) {
	capture(useUpdater()?.check);
	return null;
}

for (const platform of ["desktop", "android"] as const) {
	test(`${platform} checks shortly after launch, on return, and on demand`, async () => {
		vi.useFakeTimers();
		const check = vi.fn(async () => null);
		vi.mocked(updatePlatform).mockReturnValue(platform);
		vi.mocked(updateDriver).mockReturnValue({ platform, check });
		let manual: (() => Promise<void>) | undefined;
		const view = render(
			<UpdateProvider>
				<Manual
					capture={(capture) => {
						manual = capture;
					}}
				/>
			</UpdateProvider>,
		);
		// Nothing during the first seconds: sign-in and the first screen come first.
		expect(check).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(5_000);
		expect(check).toHaveBeenCalledOnce();
		// Coming back to the window after the throttle is the cheapest way to notice a release.
		await vi.advanceTimersByTimeAsync(31 * 60 * 1000);
		await act(async () => {
			window.dispatchEvent(new Event("focus"));
		});
		expect(check).toHaveBeenCalledTimes(2);
		await act(async () => {
			await manual?.();
		});
		expect(check).toHaveBeenCalledTimes(3);
		view.unmount();
		// Unmounting must leave no timer behind to call into a disposed updater.
		await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
		expect(check).toHaveBeenCalledTimes(3);
	});
}
