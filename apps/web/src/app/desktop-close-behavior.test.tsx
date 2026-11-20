// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";
import { DesktopCloseBehavior } from "./desktop-close-behavior.tsx";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

afterEach(() => {
	cleanup();
	invoke.mockReset();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function show() {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<DesktopCloseBehavior />
		</I18nextProvider>,
	);
}

test("desktop close behavior reads and persists through the native bridge", async () => {
	vi.stubGlobal("__TAURI_INTERNALS__", {});
	vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0");
	let saved = "tray";
	invoke.mockImplementation(async (command: string, input?: { behavior: string }) => {
		if (command === "get_desktop_close_behavior") return saved;
		if (command === "set_desktop_close_behavior" && input) saved = input.behavior;
	});
	const view = show();
	const tray = screen.getByRole("radio", { name: "Keep running in tray" });
	const quit = screen.getByRole("radio", { name: "Quit Yonder" });
	await waitFor(() => expect(tray).toBeChecked());
	fireEvent.click(quit);
	await waitFor(() => expect(quit).toBeChecked());
	expect(invoke).toHaveBeenCalledWith("set_desktop_close_behavior", { behavior: "quit" });
	view.unmount();
	show();
	await waitFor(() => expect(screen.getByRole("radio", { name: "Quit Yonder" })).toBeChecked());
	invoke.mockRejectedValueOnce(new Error("disk"));
	fireEvent.click(screen.getByRole("radio", { name: "Keep running in tray" }));
	expect(await screen.findByRole("alert")).toHaveTextContent("Could not access this setting.");
	expect(screen.getByRole("radio", { name: "Quit Yonder" })).toBeChecked();
});

test("regular browsers do not show a native close preference", () => {
	show();
	expect(screen.queryByRole("radio")).toBeNull();
	expect(invoke).not.toHaveBeenCalled();
});
