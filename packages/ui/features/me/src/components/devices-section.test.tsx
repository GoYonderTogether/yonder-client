// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { DeviceSummary } from "@yonder/protocol";
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
	] as DeviceSummary[],
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
	useMe: () => ({
		data: {
			member: { handle: "person" },
			signInMethods: [],
			hasPassword: false,
			handleChange: { canChange: true, nextChangeAt: null },
		},
	}),
	useSignOut: () => ({}),
	useDeleteAccount: () => ({ sendCode: { mutate: vi.fn() }, confirm: { mutate: vi.fn() } }),
	useChangeHandle: () => ({ mutate: vi.fn(), isPending: false }),
	ApiError: class ApiError extends Error {},
	NetworkError: class NetworkError extends Error {},
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
		expect(screen.getByText(locale === "en" ? "Online" : "在线")).toBeVisible();
		expect(screen.getByText(locale === "en" ? "Offline" : "离线")).toBeVisible();
		expect(screen.queryByRole("switch")).toBeNull();
		expect(screen.getAllByRole("button", { name: /edit remark|编辑.+的备注/i })).toHaveLength(2);
		for (const row of screen.getAllByRole("listitem")) {
			const [, signOut] = within(row).getAllByRole("button");
			expect(signOut).toHaveAccessibleName(locale === "en" ? "Sign out Windows PC" : "下线 Windows PC");
		}
	},
);

test("groups devices by platform with the web card last and the current device first within its card", () => {
	const previous = state.items;
	const [current, other] = previous;
	if (!current || !other) throw new Error("missing test devices");
	state.items = [
		{ ...other, id: "dev_web", name: "Browser", platform: "web" },
		{ ...other, name: "Other PC" },
		{ ...other, id: "dev_mini", name: "WeChat", platform: "miniprogram" },
		current,
	];
	try {
		render(
			<I18nextProvider i18n={createI18n("en")}>
				<DevicesSection />
			</I18nextProvider>,
		);
		expect(screen.getAllByRole("heading").map((item) => item.textContent)).toEqual([
			"Windows",
			"WeChat Mini Program",
			"Web",
		]);
		const lists = screen.getAllByRole("list");
		expect(lists[0]).toHaveTextContent(/Windows PC.*Other PC/);
		expect(lists[2]).toHaveTextContent("Browser");
		expect(lists[2]).not.toHaveTextContent("Other PC");
	} finally {
		state.items = previous;
	}
});

test("the security list links to devices and signs out only the selected session", () => {
	const open = vi.fn();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<AccountSection
				onChangePassword={() => {}}
				onChangePhone={() => {}}
				onSignedOut={() => {}}
				onOpenDevices={open}
			/>
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

test("a session uses the device remark without changing the session sign-out target", () => {
	const previous = state.items;
	state.items = state.items.map((device) =>
		device.id === "dev_b" ? { ...device, remark: "Studio computer" } : device,
	);
	try {
		render(
			<I18nextProvider i18n={createI18n("en")}>
				<AccountSection onChangePassword={() => {}} onChangePhone={() => {}} onSignedOut={() => {}} />
			</I18nextProvider>,
		);
		const row = screen.getByText("Studio computer").closest("li");
		if (!row) throw new Error("missing remarked device row");
		expect(within(row).getByText(/Windows PC · Windows · Offline/)).toBeVisible();
		fireEvent.click(within(row).getByRole("button", { name: "Sign out" }));
		expect(state.revoke).toHaveBeenLastCalledWith("ses_1");
	} finally {
		state.items = previous;
	}
});

test("the empty device list still links to the connection guide", () => {
	const previous = state.items;
	state.items = [];
	const connect = vi.fn();
	try {
		render(
			<I18nextProvider i18n={createI18n("en")}>
				<DevicesSection onAddDevice={connect} />
			</I18nextProvider>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Connect another device" }));
		expect(connect).toHaveBeenCalledOnce();
	} finally {
		state.items = previous;
	}
});
