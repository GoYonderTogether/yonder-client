// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({
	signInWithPassword: vi.fn().mockResolvedValue({ isNewAccount: false, accessToken: "token" }),
	sendCode: vi.fn().mockResolvedValue({ maskedTarget: "138****8000", retryAfter: 60 }),
	signIn: vi.fn().mockResolvedValue({ status: "invite_required", ticket: "proof", expiresIn: 600 }),
	redeemInvite: vi.fn(),
}));
vi.mock("@yonder/ui-data", async (load) => ({
	...(await load<typeof import("@yonder/ui-data")>()),
	clearInvite: vi.fn(),
	readInvite: () => null,
	useApi: () => api,
	useData: () => ({ storage: {} }),
	useResolvedInvite: () => ({ data: null }),
}));

import { SignInForm } from "./sign-in-form.tsx";

const device = { name: "Browser", platform: "web" as const, appVersion: "test" };

beforeEach(() => sessionStorage.clear());

test("the sign-in notice links to both legal documents without a checkbox", () => {
	const open = vi.fn();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<SignInForm device={device} onSignedIn={vi.fn()} onOpenLegal={open} />
		</I18nextProvider>,
	);
	expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
	expect(screen.getByRole("paragraph")).toHaveTextContent(
		"By signing in or signing up, you agree to the Terms of service and Privacy policy.",
	);
	const terms = screen.getByRole("link", { name: "Terms of service" });
	const privacy = screen.getByRole("link", { name: "Privacy policy" });
	expect(terms).toHaveAttribute("href", "/terms");
	expect(privacy).toHaveAttribute("href", "/privacy");
	fireEvent.click(terms);
	expect(open).toHaveBeenCalledWith("terms", terms);
	fireEvent.click(privacy);
	expect(open).toHaveBeenCalledWith("privacy", privacy);
});

test("password sign-in submits directly", async () => {
	api.signInWithPassword.mockClear();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<SignInForm device={device} initialMode="password" onSignedIn={vi.fn()} onOpenLegal={vi.fn()} />
		</I18nextProvider>,
	);
	fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "13800138000" } });
	fireEvent.change(screen.getByLabelText("Password"), { target: { value: "example-password" } });
	fireEvent.click(screen.getByRole("button", { name: /^Sign in$/ }));
	await waitFor(() =>
		expect(api.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
			target: "+8613800138000",
			password: "example-password",
			device,
		}),
	);
});

test("holds the verified user at the invite form and retries a bad code without another SMS", async () => {
	const onSignedIn = vi.fn();
	const accepted = { isNewAccount: true, accessToken: "token" };
	api.redeemInvite
		.mockRejectedValueOnce(new ApiError({ code: "invite_invalid", status: 404, message: "invalid" }))
		.mockResolvedValueOnce(accepted);
	const form = () => (
		<I18nextProvider i18n={createI18n("zh-CN")}>
			<SignInForm device={device} onSignedIn={onSignedIn} onOpenLegal={vi.fn()} />
		</I18nextProvider>
	);
	const { unmount } = render(form());
	expect(screen.getByRole("paragraph")).toHaveTextContent("登录或注册即同意用户协议和隐私政策。");
	fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800138000" } });
	fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
	fireEvent.change(await screen.findByLabelText("6 位验证码"), { target: { value: "123456" } });
	expect(await screen.findByRole("heading", { name: "输入邀请码" })).toBeVisible();
	expect(api.signIn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ inviteFlow: true, agreeTerms: true }));
	expect(onSignedIn).not.toHaveBeenCalled();
	unmount();
	render(form());
	const join = screen.getByRole("button", { name: "加入内测" });
	const input = screen.getByLabelText("邀请码");
	expect(join).toBeDisabled();
	fireEvent.change(input, { target: { value: "incorrect" } });
	fireEvent.click(join);
	expect(await screen.findByRole("alert")).toHaveTextContent("邀请码无效，请检查或换一个。");
	expect(onSignedIn).not.toHaveBeenCalled();
	fireEvent.change(input, { target: { value: "valid-code" } });
	fireEvent.click(join);
	await waitFor(() => expect(onSignedIn).toHaveBeenCalledExactlyOnceWith(accepted));
	expect(api.redeemInvite).toHaveBeenLastCalledWith({ ticket: "proof", code: "valid-code", device });
	expect(api.sendCode).toHaveBeenCalledTimes(1);
});
