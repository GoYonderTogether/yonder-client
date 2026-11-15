// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
	items: [
		{
			id: "dev_a",
			name: "Windows PC",
			platform: "windows",
			current: true,
			status: "online",
			lastSeenAt: "2026-11-15T00:00:00Z",
			appVersion: "1",
		},
		{
			id: "dev_b",
			name: "Windows PC",
			platform: "windows",
			current: false,
			status: "offline",
			lastSeenAt: "2026-11-15T00:00:00Z",
			appVersion: "1",
		},
	],
	revoke: vi.fn(),
}));
vi.mock("@yonder/ui-data", () => ({
	useDevices: () => ({ data: { items: state.items }, isLoading: false, isError: false }),
	useSessions: () => ({
		data: {
			items: state.items.map((device, index) => ({
				...device,
				id: `ses_${index}`,
				deviceId: device.id,
				deviceName: device.name,
			})),
		},
	}),
	useRevokeSession: () => ({ mutate: state.revoke }),
	useMe: () => ({ data: { member: { handle: "person" }, signInMethods: [], hasPassword: false } }),
	useSignOut: () => ({}),
	useDeleteAccount: () => ({}),
}));

import { AccountSection } from "./account-section.tsx";
import { DevicesSection } from "./devices-section.tsx";

test.each(["zh-CN", "en"] as const)(
	"two same-name computers remain separate, with no control switch, in %s",
	(locale) => {
		render(
			<I18nextProvider i18n={createI18n(locale)}>
				<DevicesSection />
			</I18nextProvider>,
		);
		expect(screen.getAllByRole("listitem")).toHaveLength(2);
		expect(screen.getAllByText("Windows PC")).toHaveLength(2);
		expect(screen.getByText(locale === "en" ? "This device" : "这台设备")).toBeVisible();
		expect(screen.getByText(locale === "en" ? "Windows · Online" : "Windows · 在线", { exact: false })).toBeVisible();
		expect(screen.getByText(locale === "en" ? "Windows · Offline" : "Windows · 离线", { exact: false })).toBeVisible();
		expect(screen.queryByRole("switch")).toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
	},
);

test("the security list links to devices and signs out only the selected session", () => {
	const open = vi.fn();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<AccountSection onChangePassword={() => {}} onSignedOut={() => {}} onOpenDevices={open} />
		</I18nextProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "View devices" }));
	expect(open).toHaveBeenCalledOnce();
	const rows = screen.getAllByText("Windows PC").map((name) => name.closest("li"));
	if (!rows[0] || !rows[1]) throw new Error("missing device rows");
	expect(within(rows[0]).queryByRole("button", { name: "Sign out" })).toBeNull();
	fireEvent.click(within(rows[1]).getByRole("button", { name: "Sign out" }));
	expect(state.revoke).toHaveBeenCalledWith("ses_1");
});
