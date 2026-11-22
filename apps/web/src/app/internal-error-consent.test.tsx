// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://pilot.example.test/me/general"}
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { reportNavigationFailure, setInternalErrorConsent } from "../lib/internal-errors.ts";
import { InternalErrorConsent } from "./internal-error-consent.tsx";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(() => {
	setInternalErrorConsent(false);
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

test("the public bundle and a different HTTPS origin have no toggle and never POST", async () => {
	vi.useFakeTimers();
	const send = vi.fn();
	vi.stubGlobal("fetch", send);
	vi.stubEnv("DEV", false);
	vi.stubEnv("VITE_INTERNAL_ERROR_BUILD", "");
	vi.stubEnv("VITE_INTERNAL_ERROR_ORIGIN", "");
	const view = render(<InternalErrorConsent />);
	expect(screen.queryByRole("switch")).toBeNull();
	vi.stubEnv("VITE_INTERNAL_ERROR_BUILD", "pilot-01");
	vi.stubEnv("VITE_INTERNAL_ERROR_ORIGIN", "https://app.example.test");
	view.rerender(<InternalErrorConsent />);
	expect(screen.queryByRole("switch")).toBeNull();
	reportNavigationFailure();
	await vi.advanceTimersByTimeAsync(1100);
	expect(send).not.toHaveBeenCalled();
});

test("private HTTPS staging pilot exposes an off-by-default switch and sends only after opting in", async () => {
	vi.useFakeTimers();
	const send = vi.fn(async () => new Response(null, { status: 204 }));
	vi.stubGlobal("fetch", send);
	vi.stubEnv("DEV", false);
	vi.stubEnv("VITE_INTERNAL_ERROR_BUILD", "pilot-01");
	vi.stubEnv("VITE_INTERNAL_ERROR_ORIGIN", "https://pilot.example.test");
	render(<InternalErrorConsent />);
	const toggle = screen.getByRole("switch");
	expect(toggle).toHaveAttribute("aria-checked", "false");
	reportNavigationFailure();
	await vi.advanceTimersByTimeAsync(1100);
	expect(send).not.toHaveBeenCalled();
	fireEvent.click(toggle);
	expect(toggle).toHaveAttribute("aria-checked", "true");
	reportNavigationFailure();
	await vi.advanceTimersByTimeAsync(1100);
	expect(send).toHaveBeenCalledExactlyOnceWith(
		"/v1/internal/error-reports",
		expect.objectContaining({ credentials: "omit" }),
	);
});
