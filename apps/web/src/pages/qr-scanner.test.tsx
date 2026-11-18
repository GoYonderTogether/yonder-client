// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { QrScanner } from "./qr-scanner.tsx";

beforeEach(() => {
	vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone");
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function scanner(onResult = vi.fn()) {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<QrScanner onResult={onResult} />
		</I18nextProvider>,
	);
}

test("closing the scanner stops every camera track, including permission granted after closing", async () => {
	const stop = vi.fn();
	const secondStop = vi.fn();
	let grant: (stream: MediaStream) => void = () => undefined;
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: {
			getUserMedia: vi.fn(
				() =>
					new Promise<MediaStream>((resolve) => {
						grant = resolve;
					}),
			),
		},
	});
	const view = scanner();
	view.unmount();
	await act(async () => grant({ getTracks: () => [{ stop }, { stop: secondStop }] } as unknown as MediaStream));
	expect(stop).toHaveBeenCalledOnce();
	expect(secondStop).toHaveBeenCalledOnce();
});

test("camera access failure is visible and localized", async () => {
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: { getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) },
	});
	scanner();
	await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
	expect(screen.getByRole("alert")).not.toHaveTextContent("chatActions.");
});

test("photo decoding completing after the scanner closes cannot navigate", async () => {
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: { getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) },
	});
	let decoded: () => void = () => undefined;
	const decode = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				decoded = resolve;
			}),
	);
	vi.stubGlobal(
		"Image",
		class {
			src = "";
			decode = decode;
		},
	);
	Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:photo") });
	Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
	const onResult = vi.fn();
	const view = scanner(onResult);
	fireEvent.change(view.container.querySelector('input[type="file"]') as HTMLInputElement, {
		target: { files: [new File(["qr"], "qr.png", { type: "image/png" })] },
	});
	expect(decode).toHaveBeenCalled();
	view.unmount();
	await act(async () => decoded());
	expect(onResult).not.toHaveBeenCalled();
	expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo");
});

test.each([false, true])("desktop scanner never asks for camera permission (native: %s)", (native) => {
	vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X)");
	if (native) vi.stubGlobal("__TAURI_INTERNALS__", {});
	const getUserMedia = vi.fn().mockRejectedValue(new Error("denied"));
	Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
	const view = scanner();
	expect(getUserMedia).not.toHaveBeenCalled();
	expect(view.container.querySelector("video")).toBeNull();
	expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	expect(view.container.querySelector('input[type="file"]')).toBeInTheDocument();
});
