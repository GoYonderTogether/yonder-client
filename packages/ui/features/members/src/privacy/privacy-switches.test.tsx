// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { PrivacySettings } from "@yonder/protocol";
import { ApiError } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
	settings: { searchable: true, cardForUsers: true, cardPublicLink: true },
	error: undefined as unknown,
	update: vi.fn(),
	refetch: vi.fn(),
}));

vi.mock("@yonder/ui-data", async (original) => ({
	...(await original<typeof import("@yonder/ui-data")>()),
	usePrivacy: () => ({ data: state.settings, error: state.error, isLoading: false, refetch: state.refetch }),
	useUpdatePrivacy: () => ({ mutate: state.update, isPending: false }),
}));

import { PrivacySwitches } from "./privacy-switches.tsx";

const localised = (child: React.ReactNode, locale: "en" | "zh-CN" = "en") => (
	<I18nextProvider i18n={createI18n(locale)}>{child}</I18nextProvider>
);

beforeEach(() => {
	vi.clearAllMocks();
	state.settings = { searchable: true, cardForUsers: true, cardPublicLink: true };
	state.error = undefined;
});

test("exactly the three switches, each bound to its own setting", () => {
	render(localised(<PrivacySwitches />));
	expect(screen.getAllByRole("switch")).toHaveLength(3);
	expect(screen.getByRole("switch", { name: "Strangers can find me by my handle" })).toBeChecked();
	expect(screen.getByRole("switch", { name: "Signed-in users can view my card" })).toBeChecked();
	expect(
		screen.getByRole("switch", { name: "People who are not signed in can view my card via its link" }),
	).toBeChecked();
});

test("flipping one switch saves immediately, and only that field", async () => {
	const mutate = vi.fn((patch: Partial<PrivacySettings>, options?: { onError?: (error: unknown) => void }) => {
		state.settings = { ...state.settings, ...patch };
		options?.onError?.(undefined);
	});
	state.update = mutate;
	render(localised(<PrivacySwitches />));
	await userEvent.click(screen.getByRole("switch", { name: "Strangers can find me by my handle" }));
	expect(mutate).toHaveBeenCalledWith({ searchable: false }, expect.anything());
});

test("a failed save puts the switch back and says why", async () => {
	const failure = new ApiError({ code: "internal", status: 500, message: "server" });
	const mutate = vi.fn((_patch: Partial<PrivacySettings>, options?: { onError?: (error: unknown) => void }) => {
		options?.onError?.(failure);
	});
	state.update = mutate;
	render(localised(<PrivacySwitches />));
	const card = screen.getByRole("switch", { name: "Signed-in users can view my card" });
	await userEvent.click(card);
	expect(screen.getByRole("alert")).toBeVisible();
	// The server's answer is unchanged, so the control shows the old state rather than the attempted one.
	expect(card).toBeChecked();
});

test("the three labels exist in Chinese too, with no placeholder rows", () => {
	render(localised(<PrivacySwitches />, "zh-CN"));
	expect(screen.getAllByRole("switch")).toHaveLength(3);
	expect(screen.getByRole("switch", { name: "陌生人可以通过对外号找到我" })).toBeChecked();
	expect(screen.getByRole("switch", { name: "登录用户可以查看我的名片" })).toBeChecked();
	expect(screen.getByRole("switch", { name: "未登录的人可以通过链接查看我的名片" })).toBeChecked();
});

test("a failed read offers a retry instead of empty switches", async () => {
	state.settings = undefined as unknown as typeof state.settings;
	state.error = new ApiError({ code: "internal", status: 500, message: "server" });
	render(localised(<PrivacySwitches />));
	expect(screen.queryAllByRole("switch")).toHaveLength(0);
	await userEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(state.refetch).toHaveBeenCalledTimes(1);
});
