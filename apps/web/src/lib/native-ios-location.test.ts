import { beforeEach, expect, test, vi } from "vitest";

const mock = vi.hoisted(() => ({ native: vi.fn(), invoke: vi.fn() }));
vi.mock("./native-notifications.ts", () => ({ isNativeIosNotifications: mock.native }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mock.invoke }));

import { prepareIosLocation, readCurrentIosLocation } from "./native-ios-location.ts";

const fix = {
	latitude: 1.23,
	longitude: -4.56,
	horizontalAccuracyMeters: 2200,
	acquiredAtMs: 1_700_000_000_123,
	approximate: true,
};

beforeEach(() => {
	vi.resetAllMocks();
	mock.native.mockReturnValue(true);
});

test("returns actual fix metadata via a single read without prompting or returning unrelated IPC fields", async () => {
	mock.invoke.mockResolvedValueOnce({ ...fix, owner: "drop" });
	expect(await readCurrentIosLocation()).toEqual(fix);
	expect(mock.invoke.mock.calls).toEqual([["plugin:yonder-notifications|current_location"]]);
});

test("explicit preparation does not request a position", async () => {
	await prepareIosLocation();
	expect(mock.invoke.mock.calls).toEqual([["plugin:yonder-notifications|prepare_location"]]);
});

test("unsupported clients neither prompt nor read", async () => {
	mock.native.mockReturnValue(false);
	await expect(prepareIosLocation()).rejects.toThrow("unsupported");
	await expect(readCurrentIosLocation()).rejects.toThrow("unsupported");
	expect(mock.invoke).not.toHaveBeenCalled();
});

test.each(["location_timeout", "location_permission_required", "interrupted"])(
	"propagates native %s without prompting or manufacturing a fix",
	async (code) => {
		mock.invoke.mockRejectedValueOnce(new Error(code));
		await expect(readCurrentIosLocation()).rejects.toThrow(code);
		expect(mock.invoke.mock.calls).toEqual([["plugin:yonder-notifications|current_location"]]);
	},
);

test.each([
	null,
	{ latitude: 91 },
	{ longitude: NaN },
	{ horizontalAccuracyMeters: -1 },
	{ acquiredAtMs: 1.1 },
	{ approximate: null },
])("rejects incomplete or invalid fix %j", async (invalid) => {
	mock.invoke.mockResolvedValueOnce(invalid ? { ...fix, ...invalid } : invalid);
	await expect(readCurrentIosLocation()).rejects.toThrow("location_unavailable");
});
