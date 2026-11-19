// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { FakeApiError } = vi.hoisted(() => ({
	FakeApiError: class FakeApiError extends Error {
		readonly code: string;
		readonly details: Record<string, unknown> | undefined;
		constructor(code: string, details?: Record<string, unknown>) {
			super(code);
			this.code = code;
			this.details = details;
		}
	},
}));

const state = vi.hoisted(() => ({
	me: {
		member: { handle: "alice_one" },
		signInMethods: [] as unknown[],
		hasPassword: true,
		handleChange: { canChange: true, nextChangeAt: null as string | null },
	},
	changeHandle: vi.fn(),
	sendDeleteCode: vi.fn(),
	deleteAccount: vi.fn(),
}));

vi.mock("@yonder/ui-data", () => ({
	ApiError: FakeApiError,
	NetworkError: class NetworkError extends Error {},
	useMe: () => ({ data: state.me }),
	useSessions: () => ({ data: { items: [] } }),
	useDevices: () => ({ data: { items: [] } }),
	useRevokeSession: () => ({ mutate: vi.fn() }),
	useSignOut: () => ({ mutate: vi.fn(), isPending: false }),
	useDeleteAccount: () => ({
		sendCode: { mutate: state.sendDeleteCode, isPending: false },
		confirm: { mutate: state.deleteAccount, isPending: false },
	}),
	useChangeHandle: () => ({ mutate: state.changeHandle, isPending: false }),
}));

import { AccountSection } from "./account-section.tsx";

function renderSection(locale: "zh-CN" | "en") {
	return render(
		<I18nextProvider i18n={createI18n(locale)}>
			<AccountSection onChangePassword={() => {}} onChangePhone={() => {}} onSignedOut={() => {}} />
		</I18nextProvider>,
	);
}

beforeEach(() => {
	state.me.signInMethods = [
		{ channel: "sms", masked: "+86138****8000", boundAt: "2026-11-01T00:00:00Z" },
		{ channel: "wechat", boundAt: "2026-11-02T00:00:00Z" },
	];
	state.me.handleChange = { canChange: true, nextChangeAt: null };
	state.changeHandle.mockReset();
	state.deleteAccount.mockReset();
	state.sendDeleteCode.mockReset();
});

test.each([
	["en", "Phone number", "WeChat (mini program)"],
	["zh-CN", "手机号", "微信（小程序）"],
] as const)("both bound sign-in methods are listed in %s", (locale, phone, wechat) => {
	renderSection(locale);
	expect(screen.getByText(phone)).toBeVisible();
	expect(screen.getByText("+86138****8000")).toBeVisible();
	expect(screen.getByText(wechat)).toBeVisible();
});

test("the handle cannot be changed while the server says the wait is not over", () => {
	state.me.handleChange = { canChange: false, nextChangeAt: "2026-12-20T00:00:00Z" };
	renderSection("en");
	expect(screen.getByRole("button", { name: "Change ID" })).toBeDisabled();
	expect(screen.getByText(/You can change it again after/)).toBeVisible();
});

test("a taken handle shows the real reason under the field", () => {
	state.changeHandle.mockImplementation((_value: string, options: { onError: (error: unknown) => void }) =>
		options.onError(new FakeApiError("handle_taken")),
	);
	renderSection("en");
	fireEvent.click(screen.getByRole("button", { name: "Change ID" }));
	fireEvent.change(screen.getByLabelText("New ID"), { target: { value: "Someone_Else" } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(state.changeHandle).toHaveBeenCalledWith("someone_else", expect.anything());
	expect(screen.getByText("That ID is already taken.")).toBeVisible();
});

/** Open the deletion form, send the code, type the code and the handle. */
function fillDeletion(code = "123456", handle = "alice_one") {
	fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
	fireEvent.click(screen.getByRole("button", { name: /Send a code to/ }));
	fireEvent.change(screen.getByLabelText("The code you received"), { target: { value: code } });
	fireEvent.change(screen.getByRole("textbox", { name: /your ID/i }), { target: { value: handle } });
}

test("deleting needs a code to the account's own number before anything else", () => {
	state.sendDeleteCode.mockImplementation((_value: unknown, options: { onSuccess: (response: unknown) => void }) =>
		options.onSuccess({ maskedTarget: "+86138****8000" }),
	);
	renderSection("en");
	fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
	fireEvent.click(screen.getByRole("button", { name: /Send a code to/ }));
	expect(state.sendDeleteCode).toHaveBeenCalledOnce();
	expect(screen.getByText("Sent to +86138****8000.")).toBeVisible();
	// With nothing typed the final button is not usable, and no request was made.
	expect(state.deleteAccount).not.toHaveBeenCalled();
});

describe("the three-second confirmation", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	test("the final button is disabled until three seconds after the code and the handle are right", () => {
		renderSection("en");
		fillDeletion();
		const final = () => screen.getAllByRole("button", { name: /Delete account/ }).at(-1) as HTMLElement;
		expect(final()).toBeDisabled();
		expect(final()).toHaveTextContent("Delete account (3)");
		act(() => vi.advanceTimersByTime(2_000));
		expect(final()).toBeDisabled();
		expect(final()).toHaveTextContent("Delete account (1)");
		fireEvent.click(final());
		expect(state.deleteAccount).not.toHaveBeenCalled();
		act(() => vi.advanceTimersByTime(1_100));
		expect(final()).toBeEnabled();
		expect(final()).toHaveTextContent("Delete account");
		fireEvent.click(final());
		expect(state.deleteAccount).toHaveBeenCalledWith({ confirmHandle: "alice_one", code: "123456" }, expect.anything());
	});

	test("changing the handle or the code starts the three seconds again", () => {
		renderSection("en");
		fillDeletion();
		act(() => vi.advanceTimersByTime(3_500));
		const final = () => screen.getAllByRole("button", { name: /Delete account/ }).at(-1) as HTMLElement;
		expect(final()).toBeEnabled();
		fireEvent.change(screen.getByRole("textbox", { name: /your ID/i }), { target: { value: "alice_on" } });
		expect(final()).toBeDisabled();
		fireEvent.change(screen.getByRole("textbox", { name: /your ID/i }), { target: { value: "alice_one" } });
		expect(final()).toBeDisabled();
		expect(final()).toHaveTextContent("Delete account (3)");
	});
});

test.each([
	["rate_limited", { retryAfter: 30 }, "Too many attempts. Try again in 30 seconds."],
	["internal", undefined, "Something went wrong on our side."],
	["code_invalid", { remainingAttempts: 4 }, "That code is not right. 4 tries left."],
] as const)("a failed deletion shows its real reason (%s), not a handle mismatch", (code, details, sentence) => {
	vi.useFakeTimers();
	try {
		state.deleteAccount.mockImplementation((_body: unknown, options: { onError: (error: unknown) => void }) =>
			options.onError(new FakeApiError(code, details)),
		);
		renderSection("en");
		fillDeletion();
		act(() => vi.advanceTimersByTime(3_500));
		fireEvent.click(screen.getAllByRole("button", { name: /Delete account/ }).at(-1) as HTMLElement);
		expect(screen.getByText(sentence)).toBeVisible();
		expect(screen.queryByText("That does not match your ID.")).toBeNull();
	} finally {
		vi.useRealTimers();
	}
});
