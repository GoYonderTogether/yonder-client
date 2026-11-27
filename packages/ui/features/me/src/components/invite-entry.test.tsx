// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
	// A response from a service that predates the reward rule, or from a test stand-in.
	data: {
		code: "K7M2QX9PAD",
		link: "https://yonder.example/i/K7M2QX9PAD",
		stats: { invitedCount: 0, grantedTotal: 0 },
	} as
		| {
				code: string;
				link: string;
				stats: { invitedCount: number; grantedTotal: number };
				rewardRule?: { newUserGets: number; inviterGets: number; maxInvites: number | null };
		  }
		| undefined,
}));
vi.mock("@yonder/ui-data", () => ({ useInvite: () => ({ data: state.data }) }));

import { InviteEntryCard, InviteRailButton } from "./invite-entry.tsx";

function show(node: React.ReactNode) {
	return render(<I18nextProvider i18n={createI18n("zh-CN")}>{node}</I18nextProvider>);
}

/** The shell draws this on every page, so a malformed response must cost the badge, never the app. */
test("an invitation response without its reward rule still draws the entry", () => {
	state.data = {
		code: "K7M2QX9PAD",
		link: "https://yonder.example/i/K7M2QX9PAD",
		stats: { invitedCount: 0, grantedTotal: 0 },
	};
	expect(() => show(<InviteRailButton section={null} onOpen={() => {}} />)).not.toThrow();
	expect(screen.getByRole("button")).toBeInTheDocument();
	state.data = undefined;
	expect(() => show(<InviteEntryCard selected={false} onOpen={() => {}} />)).not.toThrow();
	expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
});

test("a reward rule still shows the amount it earns", () => {
	state.data = {
		code: "K7M2QX9PAD",
		link: "https://yonder.example/i/K7M2QX9PAD",
		stats: { invitedCount: 0, grantedTotal: 0 },
		rewardRule: { newUserGets: 10_000_000, inviterGets: 10_000_000, maxInvites: null },
	};
	show(<InviteRailButton section={null} onOpen={() => {}} />);
	expect(screen.getByRole("button")).toHaveAccessibleName(/10M/);
});
