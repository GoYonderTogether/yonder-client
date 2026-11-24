import { beforeEach, expect, test, vi } from "vitest";

const mock = vi.hoisted(() => ({ native: vi.fn(), invoke: vi.fn() }));
vi.mock("./native-notifications.ts", () => ({
	isNativeIosNotifications: mock.native,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mock.invoke }));

import { cancelIosPlaceReminder, iosPlaceReminderPending, scheduleIosPlaceReminder } from "./native-place-reminder.ts";

beforeEach(() => {
	vi.resetAllMocks();
	mock.native.mockReturnValue(true);
});

const place = { latitude: 32, longitude: 118 };

test("checks pending and cancels without prompting; explicit scheduling only sends a local chosen place and locale", async () => {
	mock.invoke.mockResolvedValueOnce(true);
	expect(await iosPlaceReminderPending()).toBe(true);
	await cancelIosPlaceReminder();
	expect(mock.invoke.mock.calls).toEqual([
		["plugin:yonder-notifications|place_reminder_pending", undefined],
		["plugin:yonder-notifications|cancel_place_reminder", undefined],
	]);
	mock.invoke.mockClear();
	await scheduleIosPlaceReminder({ ...place }, "zh-CN");
	expect(mock.invoke.mock.calls).toEqual([
		["plugin:yonder-notifications|prepare_place_reminder", undefined],
		["plugin:yonder-notifications|schedule_place_reminder", { ...place, chinese: true }],
	]);
});

test("unsupported and invalid requests prompt for neither permission", async () => {
	await expect(scheduleIosPlaceReminder({ latitude: Infinity, longitude: 0 }, "en")).rejects.toThrow("invalid_place");
	mock.native.mockReturnValue(false);
	await expect(scheduleIosPlaceReminder(place, "en")).rejects.toThrow("unsupported");
	expect(await iosPlaceReminderPending()).toBe(false);
	expect(mock.invoke).not.toHaveBeenCalled();
});

test.each(["notification_permission_required", "location_permission_required"])(
	"does not schedule if native preparation returns %s",
	async (failure) => {
		mock.invoke.mockRejectedValueOnce(new Error(failure));
		await expect(scheduleIosPlaceReminder(place, "en")).rejects.toThrow(failure);
		expect(mock.invoke.mock.calls).toEqual([["plugin:yonder-notifications|prepare_place_reminder", undefined]]);
	},
);

test("a cancel during the permission prompt cannot silently create a later reminder", async () => {
	let finish: () => void = () => {};
	mock.invoke.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	const pending = scheduleIosPlaceReminder(place, "en");
	await vi.waitFor(() => expect(mock.invoke).toHaveBeenCalledOnce());
	await cancelIosPlaceReminder();
	finish();
	await expect(pending).rejects.toThrow("interrupted");
	expect(mock.invoke.mock.calls).toEqual([
		["plugin:yonder-notifications|prepare_place_reminder", undefined],
		["plugin:yonder-notifications|cancel_place_reminder", undefined],
	]);
});
