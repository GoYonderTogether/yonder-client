// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { updateDriver, updatePlatform } from "./drivers.ts";
import { UpdateProvider } from "./provider.tsx";

vi.mock("./drivers.ts", () => ({ updatePlatform: vi.fn(), updateDriver: vi.fn() }));
afterEach(() => {
	vi.useRealTimers();
	vi.resetAllMocks();
});

for (const [platform, hours] of [
	["desktop", 6],
	["android", 24],
] as const) {
	test(`${platform} checks at startup and every ${hours} hours`, async () => {
		vi.useFakeTimers();
		const check = vi.fn(async () => null);
		vi.mocked(updatePlatform).mockReturnValue(platform);
		vi.mocked(updateDriver).mockReturnValue({ platform, check });
		const view = render(
			<UpdateProvider>
				<span>App</span>
			</UpdateProvider>,
		);
		await act(async () => {});
		expect(check).toHaveBeenCalledTimes(1);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(hours * 60 * 60 * 1000);
		});
		expect(check).toHaveBeenCalledTimes(2);
		view.unmount();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(hours * 60 * 60 * 1000);
		});
		expect(check).toHaveBeenCalledTimes(2);
	});
}
