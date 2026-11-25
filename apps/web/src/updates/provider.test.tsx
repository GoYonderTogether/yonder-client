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
	test(`${platform} has no periodic checks and retains explicit manual checking`, async () => {
		vi.useFakeTimers();
		const check = vi.fn(async () => null);
		vi.mocked(updatePlatform).mockReturnValue(platform);
		vi.mocked(updateDriver).mockReturnValue({ platform, check });
		let manual: (() => Promise<void>) | undefined;
		render(
			<UpdateProvider>
				<Manual
					capture={(check) => {
						manual = check;
					}}
				/>
			</UpdateProvider>,
		);
		await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
		expect(check).not.toHaveBeenCalled();
		await act(async () => {
			await manual?.();
		});
		expect(check).toHaveBeenCalledOnce();
	});
}
