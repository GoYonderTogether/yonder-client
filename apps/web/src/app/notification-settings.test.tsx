// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { NotificationSettings } from "./notification-settings.tsx";

const native = vi.hoisted(() => ({
	permission: "default" as NotificationPermission,
	request: vi.fn(async () => false),
	openSettings: vi.fn(async () => true),
	unregister: vi.fn(),
}));

vi.mock("@yonder/ui-data", () => ({
	useData: () => ({ api: { unregisterPushToken: native.unregister } }),
	usePerson: () => ({ id: "member" }),
	useNotificationPreferences: () => ({}),
	useUpdateNotificationPreferences: () => ({}),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../lib/keychain.ts", () => ({ isTauri: () => true }));
vi.mock("../lib/native-notifications.ts", () => ({
	isNativeIosNotifications: () => true,
	isNativeMobileNotifications: () => true,
	nativeNotificationPermission: async () => native.permission,
	openIosNotificationSettings: native.openSettings,
	requestNativeNotificationPermission: native.request,
}));

test("iOS requests once and uses Settings for later permission changes", async () => {
	native.request.mockImplementationOnce(async () => {
		native.permission = "denied";
		return false;
	});

	render(<NotificationSettings />);
	const toggle = screen.getByRole<HTMLInputElement>("switch", { name: /notifications\.enable/ });
	await waitFor(() => expect(toggle.disabled).toBe(false));
	fireEvent.click(toggle);
	const settings = await screen.findByRole("button", { name: /messages\.openNotificationSettings/ });
	expect(native.request).toHaveBeenCalledTimes(1);
	await act(async () => fireEvent.click(settings));
	expect(native.openSettings).toHaveBeenCalledTimes(1);

	native.permission = "granted";
	await act(async () => window.dispatchEvent(new Event("focus")));
	expect(screen.getByRole("switch", { name: /notifications\.showContent/ })).toBeDefined();
	await act(async () => fireEvent.click(settings));
	expect(native.openSettings).toHaveBeenCalledTimes(2);
	expect(native.unregister).not.toHaveBeenCalled();
});
