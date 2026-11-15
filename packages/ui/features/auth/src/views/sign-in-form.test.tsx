// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({
	signInWithPassword: vi.fn().mockResolvedValue({ isNewAccount: false, accessToken: "token" }),
}));
vi.mock("@yonder/ui-data", () => ({
	clearInvite: vi.fn(),
	readInvite: () => null,
	useApi: () => api,
	useData: () => ({ storage: {} }),
	useResolvedInvite: () => ({ data: null }),
}));

import { SignInForm } from "./sign-in-form.tsx";

const device = { name: "Browser", platform: "web" as const, appVersion: "test" };

test("the consent links navigate independently of the checkbox and its text toggles it", () => {
	const open = vi.fn();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<SignInForm device={device} onSignedIn={vi.fn()} onOpenLegal={open} />
		</I18nextProvider>,
	);
	const checkbox = screen.getByRole("checkbox");
	const terms = screen.getByRole("link", { name: "Terms of service" });
	const privacy = screen.getByRole("link", { name: "Privacy policy" });
	expect(terms).toHaveAttribute("href", "/terms");
	expect(privacy).toHaveAttribute("href", "/privacy");
	fireEvent.click(terms);
	expect(open).toHaveBeenCalledWith("terms", terms);
	expect(checkbox).not.toBeChecked();
	fireEvent.click(screen.getByText("I have read and agree to the"));
	expect(checkbox).toBeChecked();
	fireEvent.click(privacy);
	expect(open).toHaveBeenCalledWith("privacy", privacy);
	expect(checkbox).toBeChecked();
});

test("password sign-in requires consent before making a request", async () => {
	api.signInWithPassword.mockClear();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<SignInForm device={device} initialMode="password" onSignedIn={vi.fn()} onOpenLegal={vi.fn()} />
		</I18nextProvider>,
	);
	fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "13800138000" } });
	fireEvent.change(screen.getByLabelText("Password"), { target: { value: "example-password" } });
	fireEvent.click(screen.getByRole("button", { name: /^Sign in$/ }));
	expect(screen.getByRole("alert")).toHaveTextContent("Please accept the terms first.");
	expect(api.signInWithPassword).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("checkbox"));
	fireEvent.click(screen.getByRole("button", { name: /^Sign in$/ }));
	await waitFor(() => expect(api.signInWithPassword).toHaveBeenCalledTimes(1));
});
