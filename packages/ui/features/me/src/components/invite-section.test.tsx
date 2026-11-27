// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createI18n, type Locale } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
	data: {
		code: "K7M2QX9PAD",
		link: "https://yonder.example/i/K7M2QX9PAD",
		stats: { invitedCount: 3, grantedTotal: 30_000_000 },
		activation: undefined as { limit: number; used: number; remaining: number } | undefined,
		rewardRule: { newUserGets: 10_000_000, inviterGets: 10_000_000, maxInvites: null as number | null },
	},
	save: vi.fn(async () => {}),
	render: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
}));
vi.mock("@yonder/ui-data", () => ({
	useInvite: () => ({ data: state.data }),
	useMe: () => ({ data: { member: { displayName: "Test person" } } }),
}));
vi.mock("./invite-card-image.ts", () => ({
	INVITE_CARD_FILENAME: "yonder-invitation.png",
	saveInviteCard: state.save,
	renderInviteCard: state.render,
}));

import { InviteSection } from "./invite-section.tsx";

function show(locale: Locale = "zh-CN") {
	return render(
		<I18nextProvider i18n={createI18n(locale)}>
			<InviteSection />
		</I18nextProvider>,
	);
}

function setShare(share?: (data: ShareData) => Promise<void>, canShare?: (data: ShareData) => boolean) {
	Object.defineProperty(navigator, "share", { configurable: true, value: share });
	Object.defineProperty(navigator, "canShare", { configurable: true, value: canShare });
}

beforeEach(() => {
	state.data.activation = undefined;
	state.data.rewardRule.maxInvites = null;
	state.save.mockClear();
	state.render.mockClear();
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

afterEach(() => setShare());

test("leads with the context-hub line and no repeated reward sentence", () => {
	show();
	expect(screen.getByText("带着你的上下文，我们一起奔向 AGI 时代")).toBeVisible();
	expect(screen.getByText("Yonder，你的上下文中心")).toBeVisible();
	expect(screen.queryByText(/双方都能获得主额度/)).toBeNull();
	expect(screen.queryByText(/懂你、能办事/)).toBeNull();
});

test("one node per spot, filled for joined friends, each labelled with its tokens", () => {
	show();
	const track = screen.getByRole("list", { name: "邀请进度" });
	const nodes = within(track).getAllByRole("listitem");
	expect(nodes).toHaveLength(5);
	expect(nodes.filter((node) => node.getAttribute("aria-label")?.includes("已加入"))).toHaveLength(3);
	expect(nodes[3]).toHaveAttribute("aria-label", "第 4 位好友待邀请，可获得 10M tokens");
	expect(within(track).getAllByText("+10M")).toHaveLength(5);
	expect(screen.getByText("已获得 30M tokens")).toBeVisible();
});

test.each([
	["zh-CN", "规则", "好友加入后，在注册包之外可获得 10,000,000 主额度，你可获得 10,000,000 主额度。"],
	[
		"en",
		"Rules",
		"Once they join, they receive 10,000,000 main quota and you receive 10,000,000 main quota, on top of the sign-up package.",
	],
] as const)("shows actual invitation rules in %s", async (locale, rules, reward) => {
	show(locale);
	expect(screen.getByText("Test person")).toBeVisible();
	expect(screen.queryByText(/重置|reset/i)).toBeNull();
	await userEvent.click(screen.getByRole("button", { name: rules }));
	expect(within(screen.getByRole("dialog", { name: rules })).getByText(reward)).toBeVisible();
});

test("the capitalised code is on the page and copies on its own", async () => {
	const user = userEvent.setup();
	show();
	expect(screen.getByText("K7M2QX9PAD", { exact: true })).toBeVisible();
	await user.click(screen.getByRole("button", { name: "复制邀请码" }));
	await expect(navigator.clipboard.readText()).resolves.toBe("K7M2QX9PAD");
	await user.click(screen.getByRole("button", { name: "复制链接" }));
	await expect(navigator.clipboard.readText()).resolves.toBe(state.data.link);
});

test("share uses the system sheet with the link and code when there is one", async () => {
	const share = vi.fn(async () => {});
	setShare(share);
	show();
	await userEvent.click(screen.getByRole("button", { name: "分享" }));
	expect(share).toHaveBeenCalledWith({
		title: "邀请好友",
		text: "Test person 邀请你加入 Yonder，你的上下文中心。邀请码：K7M2QX9PAD",
		url: state.data.link,
	});
	expect(screen.queryByRole("dialog", { name: "邀请卡" })).toBeNull();
});

test("closing the system sheet is not reported as a failure", async () => {
	setShare(vi.fn(async () => Promise.reject(new DOMException("cancelled", "AbortError"))));
	show();
	await userEvent.click(screen.getByRole("button", { name: "分享" }));
	expect(screen.queryByRole("alert")).toBeNull();
});

test("without a system sheet, share opens the poster, which exports and copies", async () => {
	const user = userEvent.setup();
	show();
	await user.click(screen.getByRole("button", { name: "分享" }));
	const dialog = screen.getByRole("dialog", { name: "邀请卡" });
	expect(within(dialog).getByRole("img", { name: "扫码加入 Yonder" })).toBeVisible();
	expect(within(dialog).queryByRole("button", { name: "分享" })).toBeNull();
	await user.click(within(dialog).getByRole("button", { name: "保存图片" }));
	expect(state.save).toHaveBeenCalledWith(within(dialog).getByRole("img", { name: "邀请卡" }));
	await user.click(within(dialog).getByRole("button", { name: "复制链接" }));
	await expect(navigator.clipboard.readText()).resolves.toBe(state.data.link);
	await user.click(within(dialog).getByRole("button", { name: "关闭" }));
	expect(screen.queryByRole("dialog", { name: "邀请卡" })).toBeNull();
});

test("the poster shares as an image through the system sheet when it takes files", async () => {
	const share = vi.fn(async () => {});
	setShare(share, () => true);
	show();
	await userEvent.click(screen.getByRole("button", { name: "邀请卡" }));
	const dialog = screen.getByRole("dialog", { name: "邀请卡" });
	await userEvent.click(within(dialog).getByRole("button", { name: "分享" }));
	expect(state.render).toHaveBeenCalledWith(within(dialog).getByRole("img", { name: "邀请卡" }));
	const [data] = share.mock.calls[0] as unknown as [ShareData];
	expect(data.files?.[0]?.name).toBe("yonder-invitation.png");
	expect(data.text).toContain("K7M2QX9PAD");
});

test("does not promise another reward after the server's invitation limit", () => {
	state.data.rewardRule.maxInvites = 3;
	show();
	expect(screen.getByText("邀请奖励已达上限")).toBeVisible();
});

test("an exhausted activation quota disables sharing even with reward capacity", async () => {
	state.data.activation = { limit: 5, used: 5, remaining: 0 };
	show();
	expect(screen.getByText("5 个邀请名额已用完")).toBeVisible();
	for (const name of ["分享", "复制链接", "复制邀请码", "邀请卡"]) {
		expect(screen.getByRole("button", { name })).toBeDisabled();
	}
	await userEvent.click(screen.getByRole("button", { name: "规则" }));
	expect(screen.getByText("每个账号最多邀请 5 人，好友首次开通后占用一个名额。")).toBeVisible();
});

test("active beta invitations show people remaining without a larger reward cap", async () => {
	state.data.activation = { limit: 5, used: 4, remaining: 1 };
	state.data.rewardRule.maxInvites = 30;
	show();
	expect(screen.getByText("还可邀请 1 人")).toBeVisible();
	expect(within(screen.getByRole("list", { name: "邀请进度" })).getAllByRole("listitem")).toHaveLength(5);
	await userEvent.click(screen.getByRole("button", { name: "规则" }));
	expect(screen.queryByText(/最多可获得.*次邀请奖励/)).toBeNull();
});

test("an account invited past the limit still shows exactly five full spots", () => {
	state.data.stats.invitedCount = 8;
	state.data.activation = { limit: 5, used: 8, remaining: 0 };
	try {
		show();
		const nodes = within(screen.getByRole("list", { name: "邀请进度" })).getAllByRole("listitem");
		expect(nodes).toHaveLength(5);
		expect(nodes.filter((node) => node.getAttribute("aria-label")?.includes("已加入"))).toHaveLength(5);
		expect(screen.getByText("5 个邀请名额已用完")).toBeVisible();
	} finally {
		state.data.stats.invitedCount = 3;
	}
});
