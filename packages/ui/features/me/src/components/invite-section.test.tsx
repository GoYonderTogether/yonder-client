// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createI18n, type Locale } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
	data: {
		code: "real-code",
		link: "https://yonder.example/i/real-code",
		stats: { invitedCount: 3, grantedTotal: 15000 },
		rewardRule: { newUserGets: 10000, inviterGets: 5000, maxInvites: null as number | null },
	},
	save: vi.fn(async () => {}),
}));
vi.mock("@yonder/ui-data", () => ({
	useInvite: () => ({ data: state.data }),
	useMe: () => ({ data: { member: { displayName: "Test person" } } }),
}));
vi.mock("./invite-card-image.ts", () => ({ saveInviteCard: state.save }));

import { InviteSection } from "./invite-section.tsx";

function show(locale: Locale = "zh-CN") {
	return render(
		<I18nextProvider i18n={createI18n(locale)}>
			<InviteSection />
		</I18nextProvider>,
	);
}

beforeEach(() => {
	state.data.rewardRule.maxInvites = null;
	state.save.mockClear();
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: (media: string): MediaQueryList => ({
			matches: true,
			media,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(() => true),
		}),
	});
});

test.each([
	["zh-CN", "规则", "好友加入后，在注册包之外可获得 10,000 主额度，你可获得 5,000 主额度。"],
	[
		"en",
		"Rules",
		"Once they join, they receive 10,000 main quota and you receive 5,000 main quota, on top of the sign-up package.",
	],
] as const)(
	"shows actual invitation rules in %s without unsupported reset milestones",
	async (locale, rules, reward) => {
		show(locale);
		expect(screen.getByText("Test person")).toBeVisible();
		expect(screen.getByText("3", { exact: true })).toBeVisible();
		expect(screen.queryByText(/重置|reset/i)).toBeNull();
		await userEvent.click(screen.getByRole("button", { name: rules }));
		const dialog = screen.getByRole("dialog", { name: rules });
		expect(within(dialog).getByText(reward)).toBeVisible();
		expect(within(dialog).getByText("real-code", { exact: true })).toBeVisible();
	},
);

test("opens a share poster without Web Share and exports that exact poster", async () => {
	const user = userEvent.setup();
	show();
	await user.click(screen.getByRole("button", { name: "立即分享" }));
	const dialog = screen.getByRole("dialog", { name: "邀请卡" });
	expect(within(dialog).getByRole("img", { name: "扫码加入 Yonder" })).toBeVisible();
	await user.click(within(dialog).getByRole("button", { name: "保存图片" }));
	expect(state.save).toHaveBeenCalledWith(within(dialog).getByRole("img", { name: "邀请卡" }));
	await user.click(within(dialog).getByRole("button", { name: "复制链接" }));
	await expect(navigator.clipboard.readText()).resolves.toBe(state.data.link);
	await user.click(within(dialog).getByRole("button", { name: "关闭" }));
	expect(screen.queryByRole("dialog", { name: "邀请卡" })).toBeNull();
});

test("does not promise another reward after the server's invitation limit", () => {
	state.data.rewardRule.maxInvites = 3;
	show();
	expect(screen.getByText("邀请奖励已达上限")).toBeVisible();
	expect(screen.queryByText(/再邀请/)).toBeNull();
});
